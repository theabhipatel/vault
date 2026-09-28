import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { qk, useMe } from "@/hooks/api"
import { client, unwrap } from "@/lib/api"
import type { Schemas } from "@/lib/api"
import { KeyChangeDialog, SetupVaultDialog, UnlockVaultDialog } from "@/components/vault/vault-dialogs"

import { createVault, unlockWithPassword, unlockWithRecoveryKey } from "./crypto"
import { calibrateKdf, derive } from "./kdf"
import { runPendingWork } from "./protocol"
import type { ProjectKeyChange } from "./protocol"
import { vaultSession } from "./session"

export type VaultStatus = "loading" | "none" | "locked" | "unlocked"
export type StoredVaultOut = Schemas["VaultOut"]

const AUTOLOCK_KEY = "vault-autolock-minutes"
export const AUTOLOCK_CHOICES = [5, 15, 30, 60] as const
const SYNC_INTERVAL_MS = 60_000

interface VaultContextValue {
  status: VaultStatus
  vault: StoredVaultOut | null
  autoLockMinutes: number
  setAutoLockMinutes: (minutes: number) => void
  unlock: (password: string) => Promise<void>
  unlockWithRecovery: (recoveryKey: string) => Promise<void>
  /** Create the vault; returns the recovery key to show once. */
  setup: (password: string) => Promise<string>
  lock: () => void
  openUnlock: () => void
  openSetup: () => void
  syncNow: () => Promise<void>
  refresh: () => Promise<void>
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error("useVault must be used inside VaultProvider")
  return ctx
}

export const vaultQueryKey = ["vault"] as const

function readAutoLock(): number {
  try {
    const value = Number(localStorage.getItem(AUTOLOCK_KEY))
    return AUTOLOCK_CHOICES.includes(value as (typeof AUTOLOCK_CHOICES)[number]) ? value : 15
  } catch {
    return 15
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const vaultQuery = useQuery({
    queryKey: vaultQueryKey,
    queryFn: () => unwrap(client.GET("/api/vault")),
    enabled: Boolean(me),
    staleTime: 60_000,
  })
  useSyncExternalStore(vaultSession.subscribe, vaultSession.snapshot)
  const [autoLockMinutes, setAutoLockState] = useState(readAutoLock)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [keyChanges, setKeyChanges] = useState<ProjectKeyChange[]>([])
  const dismissedChanges = useRef(new Set<string>())
  const syncing = useRef(false)

  const vault = vaultQuery.data ?? null
  const unlocked = vaultSession.isUnlocked && vaultSession.userId === me?.id
  const status: VaultStatus = !me || vaultQuery.isPending ? "loading" : !vault ? "none" : unlocked ? "unlocked" : "locked"

  // Decrypted content only lives while unlocked: drop it from the query cache on lock.
  useEffect(() => {
    if (status === "locked" || status === "none") {
      queryClient.removeQueries({ queryKey: ["secure"] })
    }
  }, [status, queryClient])

  // Signing out (or switching user) always locks.
  useEffect(() => {
    if (vaultSession.isUnlocked && vaultSession.userId !== me?.id) vaultSession.lock()
  }, [me?.id])

  const invalidateVaultViews = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspace"] })
    await queryClient.invalidateQueries({ queryKey: qk.notifications })
    await queryClient.invalidateQueries({ queryKey: ["vault-summary"] })
    await queryClient.invalidateQueries({ queryKey: ["project-vault"] })
  }, [queryClient])

  const syncNow = useCallback(async () => {
    if (!vaultSession.isUnlocked || syncing.current) return
    syncing.current = true
    try {
      const result = await runPendingWork()
      if (result.granted > 0) {
        toast.success(`Shared project keys with ${result.granted} teammate${result.granted === 1 ? "" : "s"}.`)
      }
      for (const name of result.rotated) toast.success(`Rotated the encryption key for ${name}.`)
      const fresh = result.keyChanges.filter((c) => !dismissedChanges.current.has(`${c.projectId}:${c.recipient.user_id}:${c.recipient.public_key}`))
      if (fresh.length > 0) setKeyChanges(fresh)
      if (result.granted > 0 || result.rotated.length > 0) await invalidateVaultViews()
    } catch {
      // Background work retries on the next interval.
    } finally {
      syncing.current = false
    }
  }, [invalidateVaultViews])

  // Background completion of pending grants and rotations while unlocked.
  useEffect(() => {
    if (status !== "unlocked") return
    void syncNow()
    const timer = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [status, syncNow])

  // Auto-lock after inactivity.
  useEffect(() => {
    if (status !== "unlocked") return
    let timer = window.setTimeout(lockForInactivity, autoLockMinutes * 60_000)
    function lockForInactivity() {
      vaultSession.lock()
      toast("Your vault locked after inactivity.")
    }
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(lockForInactivity, autoLockMinutes * 60_000)
    }
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const
    for (const e of events) window.addEventListener(e, reset, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, reset)
    }
  }, [status, autoLockMinutes])

  const value = useMemo<VaultContextValue>(() => {
    const requireVault = (): StoredVaultOut => {
      if (!vault || !me) throw new Error("Set up your vault first.")
      return vault
    }
    return {
      status,
      vault,
      autoLockMinutes,
      setAutoLockMinutes: (minutes) => {
        setAutoLockState(minutes)
        try {
          localStorage.setItem(AUTOLOCK_KEY, String(minutes))
        } catch {
          // Preference only.
        }
      },
      unlock: async (password) => {
        const stored = requireVault()
        const keypair = await unlockWithPassword(stored, stored.user_id, password, derive)
        vaultSession.unlock(stored.user_id, keypair)
      },
      unlockWithRecovery: async (recoveryKey) => {
        const stored = requireVault()
        const keypair = await unlockWithRecoveryKey(stored, stored.user_id, recoveryKey)
        vaultSession.unlock(stored.user_id, keypair)
      },
      setup: async (password) => {
        if (!me) throw new Error("Not signed in")
        const params = await calibrateKdf()
        const created = await createVault(me.id, password, params, derive)
        const saved = await unwrap(client.POST("/api/vault", { body: created.stored }))
        queryClient.setQueryData(vaultQueryKey, saved)
        vaultSession.unlock(me.id, created.keypair)
        await invalidateVaultViews()
        return created.recoveryKey
      },
      lock: () => vaultSession.lock(),
      openUnlock: () => setUnlockOpen(true),
      openSetup: () => setSetupOpen(true),
      syncNow,
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: vaultQueryKey })
        await invalidateVaultViews()
      },
    }
  }, [status, vault, me, autoLockMinutes, queryClient, invalidateVaultViews, syncNow])

  return (
    <VaultContext.Provider value={value}>
      {children}
      <UnlockVaultDialog open={unlockOpen} onOpenChange={setUnlockOpen} />
      <SetupVaultDialog open={setupOpen} onOpenChange={setSetupOpen} />
      <KeyChangeDialog
        changes={keyChanges}
        onDone={(handled) => {
          for (const c of handled) dismissedChanges.current.add(`${c.projectId}:${c.recipient.user_id}:${c.recipient.public_key}`)
          setKeyChanges([])
          void syncNow()
        }}
      />
    </VaultContext.Provider>
  )
}
