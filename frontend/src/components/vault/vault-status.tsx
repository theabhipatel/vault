import { useState } from "react"
import { Lock, LockOpen, Settings2, ShieldPlus, X } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useVault } from "@/vault/vault-context"

/** Always-visible vault indicator: not set up / locked / unlocked. */
export function VaultStatusButton() {
  const vault = useVault()
  if (vault.status === "loading") return null

  if (vault.status === "none") {
    return (
      <Button variant="outline" size="sm" className="border-secure/40 text-secure hover:bg-secure-soft" onClick={vault.openSetup}>
        <ShieldPlus /> <span className="hidden sm:inline">Set up vault</span>
      </Button>
    )
  }

  if (vault.status === "locked") {
    return (
      <Button variant="outline" size="sm" onClick={vault.openUnlock} aria-label="Vault locked. Unlock">
        <Lock className="text-secure" /> <span className="hidden sm:inline">Locked</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-success/40" aria-label="Vault unlocked">
          <LockOpen className="text-success" /> <span className="hidden sm:inline">Unlocked</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Your vault is unlocked in this tab. It locks after {vault.autoLockMinutes} minutes of inactivity.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={vault.lock}>
          <Lock /> Lock now
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings/vault">
            <Settings2 /> Vault settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const BANNER_KEY = "vault-banner-dismissed"

/** Gentle reminder for users who skipped vault setup. Comes back next session. */
export function VaultSetupBanner() {
  const vault = useVault()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === "1"
    } catch {
      return false
    }
  })
  if (vault.status !== "none" || dismissed) return null
  return (
    <div className={cn("flex items-center gap-3 border-b border-secure/25 bg-secure-soft/60 px-4 py-2.5 text-sm sm:px-6")}>
      <ShieldPlus className="size-4 shrink-0 text-secure" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Set up your vault</span>
        <span className="text-muted-foreground hidden sm:inline"> to create and read end-to-end encrypted documents.</span>
      </p>
      <Button size="sm" variant="secure" onClick={vault.openSetup}>
        Set up
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true)
          try {
            sessionStorage.setItem(BANNER_KEY, "1")
          } catch {
            // Dismissed for this page view only.
          }
        }}
      >
        <X />
      </Button>
    </div>
  )
}
