import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, Lock, LockOpen, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, ShieldPlus, TriangleAlert } from "lucide-react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { Fingerprint } from "@/components/vault/fingerprint"
import { RecoveryKeyPanel } from "@/components/vault/recovery-key-panel"
import { useNewVaultPassword } from "@/components/vault/vault-dialogs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useMe } from "@/hooks/api"
import { client, errorMessage, unwrap } from "@/lib/api"
import { shortDate } from "@/lib/format"
import { auditedUnlock } from "@/vault/audit"
import { DecryptionError, createVault, rewrapWithNewRecoveryKey, rewrapWithPassword, unlockWithPassword, unlockWithRecoveryKey, wipe } from "@/vault/crypto"
import type { Keypair } from "@/vault/crypto"
import { calibrateKdf, derive } from "@/vault/kdf"
import { vaultSession } from "@/vault/session"
import { AUTOLOCK_CHOICES, useVault, vaultQueryKey } from "@/vault/vault-context"

export function VaultSection() {
  const vault = useVault()
  const { data: me } = useMe()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<"password" | "recovery" | "recover" | "reset" | null>(null)

  useEffect(() => {
    if (params.get("recover") === "1" && vault.status === "locked") {
      setDialog("recover")
      params.delete("recover")
      setParams(params, { replace: true })
    }
  }, [params, setParams, vault.status])

  if (vault.status === "loading" || !me) return <Spinner />

  if (vault.status === "none") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldPlus className="size-4 text-secure" /> Vault
          </CardTitle>
          <CardDescription>
            You haven't set up your vault yet. Everything else works, but secure documents stay locked until you do.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="secure" onClick={vault.openSetup}>
            <ShieldPlus /> Set up your vault
          </Button>
        </CardFooter>
      </Card>
    )
  }

  const unlocked = vault.status === "unlocked"
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-secure" /> Vault
            {unlocked ? (
              <Badge variant="success">
                <LockOpen /> Unlocked
              </Badge>
            ) : (
              <Badge variant="secure">
                <Lock /> Locked
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Your keys are decrypted only in this browser tab while unlocked. Reloading, signing out or inactivity locks it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Your key fingerprint</p>
            <Fingerprint publicKey={vault.vault?.public_key} className="text-sm" />
            <p className="text-muted-foreground text-xs">
              Teammates see this next to your name. If they ask, read it to them over a call so they can verify it's really
              you. Set up {vault.vault ? shortDate(vault.vault.created_at) : ""}.
            </p>
          </div>
          <Field className="max-w-xs">
            <FieldLabel>Lock automatically after</FieldLabel>
            <Select value={String(vault.autoLockMinutes)} onValueChange={(v) => vault.setAutoLockMinutes(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOLOCK_CHOICES.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} minutes of inactivity
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
        <CardFooter className="gap-2">
          {unlocked ? (
            <Button variant="outline" onClick={vault.lock}>
              <Lock /> Lock now
            </Button>
          ) : (
            <Button variant="secure" onClick={vault.openUnlock}>
              <KeyRound /> Unlock
            </Button>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vault password</CardTitle>
          <CardDescription>
            Changing it re-encrypts your private key with a new salt. Your keypair and project access stay the same.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-wrap gap-2">
          <Button variant="outline" disabled={!unlocked} onClick={() => setDialog("password")}>
            <KeyRound /> Change vault password
          </Button>
          {!unlocked ? (
            <Button variant="ghost" onClick={() => setDialog("recover")}>
              Forgot it? Use your recovery key
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recovery key</CardTitle>
          <CardDescription>
            Lost your recovery key, or worried someone saw it? Generate a new one; the old one stops working immediately.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" disabled={!unlocked} onClick={() => setDialog("recovery")}>
            <RefreshCw /> Generate a new recovery key
          </Button>
        </CardFooter>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Reset vault</CardTitle>
          <CardDescription>
            Only if you've lost both your vault password and your recovery key. You'll get a brand-new keypair and wait for
            teammates to share project keys with you again.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="destructive" onClick={() => setDialog("reset")}>
            <RotateCcw /> Reset my vault…
          </Button>
        </CardFooter>
      </Card>

      {dialog === "password" ? <ChangePasswordDialog userId={me.id} onClose={() => setDialog(null)} /> : null}
      {dialog === "recovery" ? <RegenerateRecoveryDialog userId={me.id} email={me.email} onClose={() => setDialog(null)} /> : null}
      {dialog === "recover" ? <RecoverDialog userId={me.id} email={me.email} onClose={() => setDialog(null)} /> : null}
      {dialog === "reset" ? <ResetDialog userId={me.id} email={me.email} onClose={() => setDialog(null)} /> : null}
    </>
  )
}

function useSaveVault() {
  const queryClient = useQueryClient()
  return (saved: unknown) => queryClient.setQueryData(vaultQueryKey, saved)
}

function ChangePasswordDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const vault = useVault()
  const { data: me } = useMe()
  const save = useSaveVault()
  const [current, setCurrent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const next = useNewVaultPassword([me?.email ?? "", me?.name ?? "", current])
  const change = useMutation({
    mutationFn: async () => {
      if (!vault.vault) throw new Error("No vault")
      // Prove knowledge of the current password before replacing it.
      try {
        const stored = vault.vault
        // Already unlocked: only a wrong password is worth recording here.
        const check = await auditedUnlock("password", "password_change", () => unlockWithPassword(stored, userId, current, derive), {
          reportSuccess: false,
        })
        wipe(check.privateKey)
      } catch (e) {
        if (e instanceof DecryptionError) throw new Error("Your current vault password isn't right.")
        throw e
      }
      const params = await calibrateKdf()
      const body = await rewrapWithPassword(vaultSession.requireKeypair(), userId, next.password, params, derive)
      return unwrap(client.PUT("/api/vault/password", { body }))
    },
    onSuccess: (saved) => {
      save(saved)
      toast.success("Vault password changed.")
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && !change.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (current && next.valid) change.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Change vault password</DialogTitle>
            <DialogDescription>Nothing needs to be re-shared; only the wrapping of your key changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-5">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="current-vault-password">Current vault password</FieldLabel>
              <Input id="current-vault-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
            {next.fields}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={change.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="secure" disabled={!current || !next.valid || change.isPending}>
              {change.isPending ? <Spinner /> : null} Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RegenerateRecoveryDialog({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
  const save = useSaveVault()
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const regenerate = useMutation({
    mutationFn: async () => {
      const { recoveryKey: key, payload } = await rewrapWithNewRecoveryKey(vaultSession.requireKeypair(), userId)
      const stored = await unwrap(client.PUT("/api/vault/recovery", { body: payload }))
      return { key, stored }
    },
    onSuccess: ({ key, stored }) => {
      save(stored)
      setRecoveryKey(key)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && (!recoveryKey || saved) && onClose()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!recoveryKey}>
        <DialogHeader>
          <DialogTitle>{recoveryKey ? "Save your new recovery key" : "Generate a new recovery key?"}</DialogTitle>
          <DialogDescription>
            {recoveryKey ? "Your old recovery key no longer works." : "Your current recovery key will stop working as soon as the new one is created."}
          </DialogDescription>
        </DialogHeader>
        {recoveryKey ? <RecoveryKeyPanel recoveryKey={recoveryKey} email={email} confirmed={saved} onConfirmedChange={setSaved} /> : null}
        <DialogFooter>
          {recoveryKey ? (
            <Button variant="secure" disabled={!saved} onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="secure" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
                {regenerate.isPending ? <Spinner /> : <RefreshCw />} Generate new key
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecoverDialog({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
  const vault = useVault()
  const { data: me } = useMe()
  const save = useSaveVault()
  const [step, setStep] = useState<"key" | "password" | "done">("key")
  const [recoveryInput, setRecoveryInput] = useState("")
  const [keypair, setKeypair] = useState<Keypair | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newRecovery, setNewRecovery] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const next = useNewVaultPassword([me?.email ?? "", me?.name ?? ""])

  const check = useMutation({
    mutationFn: async () => {
      if (!vault.vault) throw new Error("No vault")
      const stored = vault.vault
      return auditedUnlock("recovery_key", "recovery", () => unlockWithRecoveryKey(stored, userId, recoveryInput))
    },
    onSuccess: (kp) => {
      setKeypair(kp)
      setError(null)
      setStep("password")
    },
    onError: (e) => setError(e instanceof DecryptionError ? "That recovery key doesn't unlock this vault." : errorMessage(e)),
  })
  const finish = useMutation({
    mutationFn: async () => {
      if (!keypair) throw new Error("No key")
      const params = await calibrateKdf()
      const pw = await rewrapWithPassword(keypair, userId, next.password, params, derive)
      const rec = await rewrapWithNewRecoveryKey(keypair, userId)
      const stored = await unwrap(client.POST("/api/vault/recover", { body: { ...pw, ...rec.payload } }))
      return { stored, key: rec.recoveryKey }
    },
    onSuccess: ({ stored, key }) => {
      save(stored)
      if (keypair) vaultSession.unlock(userId, keypair)
      setKeypair(null)
      setNewRecovery(key)
      setStep("done")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const cancel = () => {
    if (keypair) wipe(keypair.privateKey)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && step !== "done" && !finish.isPending && cancel()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={step !== "done"}>
        <DialogHeader>
          <DialogTitle>
            {step === "key" ? "Recover your vault" : step === "password" ? "Choose a new vault password" : "Save your new recovery key"}
          </DialogTitle>
          <DialogDescription>
            {step === "key"
              ? "Enter the recovery key you saved when you set up your vault."
              : step === "password"
                ? "Your recovery key worked. Your keys are unchanged; only the password is new."
                : "For safety, your old recovery key was replaced. Your vault is unlocked."}
          </DialogDescription>
        </DialogHeader>
        {step === "key" ? (
          <Field data-invalid={Boolean(error)} className="py-2">
            <FieldLabel htmlFor="recovery-input">Recovery key</FieldLabel>
            <Textarea
              id="recovery-input"
              rows={3}
              className="font-mono tracking-wider uppercase"
              placeholder="XXXX-XXXX-XXXX-…"
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        ) : step === "password" ? (
          <div className="py-2">{next.fields}</div>
        ) : newRecovery ? (
          <RecoveryKeyPanel recoveryKey={newRecovery} email={email} confirmed={saved} onConfirmedChange={setSaved} />
        ) : null}
        <DialogFooter>
          {step === "key" ? (
            <>
              <Button variant="outline" onClick={cancel}>
                Cancel
              </Button>
              <Button variant="secure" disabled={!recoveryInput.trim() || check.isPending} onClick={() => check.mutate()}>
                {check.isPending ? <Spinner /> : null} Continue
              </Button>
            </>
          ) : step === "password" ? (
            <Button variant="secure" disabled={!next.valid || finish.isPending} onClick={() => finish.mutate()}>
              {finish.isPending ? <Spinner /> : null} Save new password
            </Button>
          ) : (
            <Button variant="secure" disabled={!saved} onClick={onClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetDialog({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
  const { data: me } = useMe()
  const vault = useVault()
  const save = useSaveVault()
  const [typed, setTyped] = useState("")
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const next = useNewVaultPassword([me?.email ?? "", me?.name ?? ""])
  const impact = useQuery({ queryKey: ["vault-reset-impact"], queryFn: () => unwrap(client.GET("/api/vault/reset-impact")) })
  const sole = (impact.data ?? []).filter((p) => p.sole_holder)

  const reset = useMutation({
    mutationFn: async () => {
      const params = await calibrateKdf()
      const created = await createVault(userId, next.password, params, derive)
      const stored = await unwrap(client.POST("/api/vault/reset", { body: { ...created.stored, confirm: "RESET" } }))
      return { stored, created }
    },
    onSuccess: async ({ stored, created }) => {
      save(stored)
      vaultSession.unlock(userId, created.keypair)
      setRecoveryKey(created.recoveryKey)
      await vault.refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && !recoveryKey && !reset.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!recoveryKey}>
        {recoveryKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Your vault was reset</DialogTitle>
              <DialogDescription>
                Save your new recovery key. Teammates' browsers will share project keys with you again automatically; they'll
                be asked to verify your new fingerprint first.
              </DialogDescription>
            </DialogHeader>
            <RecoveryKeyPanel recoveryKey={recoveryKey} email={email} confirmed={saved} onConfirmedChange={setSaved} />
            <DialogFooter>
              <Button variant="secure" disabled={!saved} onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/25">
                <ShieldAlert className="size-5" />
              </div>
              <DialogTitle>Reset your vault?</DialogTitle>
              <DialogDescription>
                This creates a new keypair and discards every project key you hold. Try your recovery key first if you have
                it.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] space-y-4 overflow-y-auto py-1">
              {impact.isPending ? <Spinner /> : null}
              {sole.length > 0 ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>These will become permanently unreadable</AlertTitle>
                  <AlertDescription>
                    <p>You're the only person holding the key for:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {sole.map((p) => (
                        <li key={p.project_id}>
                          {p.project_name} ({p.workspace_name}) · {p.secure_document_count} secure document
                          {p.secure_document_count === 1 ? "" : "s"}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 font-medium">Nobody, including the operators, can recover them.</p>
                  </AlertDescription>
                </Alert>
              ) : impact.data ? (
                <Alert variant="brand">
                  <AlertDescription>
                    {impact.data.length > 0
                      ? `Teammates also hold the keys for your ${impact.data.length} project${impact.data.length === 1 ? "" : "s"}, so nothing will be lost. Those keys will be rotated.`
                      : "You don't hold any project keys yet, so nothing will be lost."}
                  </AlertDescription>
                </Alert>
              ) : null}
              {next.fields}
              <Field>
                <FieldLabel htmlFor="reset-confirm">
                  Type <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">RESET</span> to confirm
                </FieldLabel>
                <Input id="reset-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={reset.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={typed !== "RESET" || !next.valid || reset.isPending || impact.isPending} onClick={() => reset.mutate()}>
                {reset.isPending ? <Spinner /> : null} Reset vault
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
