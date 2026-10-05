import { useState } from "react"
import { ArrowRight, KeyRound, Lock, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"

import { PasswordInput } from "@/components/password-input"
import { PasswordStrength, estimateStrength } from "@/components/password-strength"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useMe } from "@/hooks/api"
import { errorMessage } from "@/lib/api"
import { DecryptionError } from "@/vault/crypto"
import { trustAndGrant } from "@/vault/protocol"
import type { ProjectKeyChange } from "@/vault/protocol"
import { useVault } from "@/vault/vault-context"

import { Fingerprint } from "./fingerprint"
import { RecoveryKeyPanel } from "./recovery-key-panel"

export const VAULT_PASSWORD_MIN = 8

/** New vault password with confirmation and strength checks. Returns null until valid. */
export function useNewVaultPassword(userInputs: string[]) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [score, setScore] = useState<number | null>(null)
  const tooShort = password.length > 0 && password.length < VAULT_PASSWORD_MIN
  const mismatch = confirm.length > 0 && confirm !== password
  const weak = score !== null && score < 2
  const valid = password.length >= VAULT_PASSWORD_MIN && password === confirm && score !== null && score >= 2

  const onPassword = (value: string) => {
    setPassword(value)
    setScore(null)
    if (value) void estimateStrength(value, userInputs).then((s) => setScore(s.score))
  }

  const fields = (
    <FieldGroup>
      <Field data-invalid={tooShort || weak}>
        <FieldLabel htmlFor="vault-password">Vault password</FieldLabel>
        <PasswordInput id="vault-password" value={password} onChange={(e) => onPassword(e.target.value)} autoFocus autoComplete="new-password" />
        <PasswordStrength password={password} userInputs={userInputs} />
        <FieldDescription>
          At least {VAULT_PASSWORD_MIN} characters. Make it different from your login password. A few random words work well.
        </FieldDescription>
        {tooShort ? <FieldError>Use at least {VAULT_PASSWORD_MIN} characters.</FieldError> : null}
        {!tooShort && weak ? <FieldError>This password is too easy to guess.</FieldError> : null}
      </Field>
      <Field data-invalid={mismatch}>
        <FieldLabel htmlFor="vault-password-confirm">Confirm vault password</FieldLabel>
        <PasswordInput id="vault-password-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        {mismatch ? <FieldError>The passwords don't match.</FieldError> : null}
      </Field>
    </FieldGroup>
  )
  const reset = () => {
    setPassword("")
    setConfirm("")
    setScore(null)
  }
  return { password, valid, fields, reset }
}

// ---- Unlock --------------------------------------------------------------------------------------

export function UnlockVaultDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const vault = useVault()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = (next: boolean) => {
    if (busy) return
    if (!next) {
      setPassword("")
      setError(null)
    }
    onOpenChange(next)
  }

  const submit = async () => {
    if (!password) return
    setBusy(true)
    setError(null)
    try {
      await vault.unlock(password)
      setPassword("")
      onOpenChange(false)
      toast.success("Vault unlocked.")
    } catch (e) {
      setError(e instanceof DecryptionError ? "That vault password isn't right." : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-secure-soft text-secure ring-1 ring-secure/25">
              <Lock className="size-5" />
            </div>
            <DialogTitle>Unlock your vault</DialogTitle>
            <DialogDescription>
              Your vault password decrypts your keys here in this browser. It's never sent to the server.
            </DialogDescription>
          </DialogHeader>
          <Field className="py-5" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="unlock-password">Vault password</FieldLabel>
            <PasswordInput id="unlock-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
            {error ? <FieldError>{error}</FieldError> : null}
            <FieldDescription>
              Forgot it?{" "}
              <Link to="/settings/vault?recover=1" className="underline underline-offset-2" onClick={() => onOpenChange(false)}>
                Use your recovery key
              </Link>
            </FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="secure" disabled={!password || busy}>
              {busy ? <Spinner /> : <KeyRound />} {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- Setup ---------------------------------------------------------------------------------------

export type SetupStep = "intro" | "password" | "working" | "recovery"

export function SetupVaultFlow({
  onDone,
  onCancel,
  onStepChange,
  cancelLabel = "Not now",
}: {
  onDone: () => void
  onCancel?: () => void
  onStepChange?: (step: SetupStep) => void
  cancelLabel?: string
}) {
  const vault = useVault()
  const { data: me } = useMe()
  const [step, setStepState] = useState<SetupStep>("intro")
  const setStep = (next: SetupStep) => {
    setStepState(next)
    onStepChange?.(next)
  }
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const newPassword = useNewVaultPassword([me?.email ?? "", me?.name ?? ""])

  const create = async () => {
    setStep("working")
    try {
      const key = await vault.setup(newPassword.password)
      newPassword.reset()
      setRecoveryKey(key)
      setStep("recovery")
    } catch (e) {
      toast.error(errorMessage(e))
      setStep("password")
    }
  }

  if (step === "intro") {
    return (
      <div className="space-y-5">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-secure-soft text-secure ring-1 ring-secure/25">
          <ShieldCheck className="size-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Set up your vault</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Secure documents are encrypted in your browser with keys only you and your teammates hold. Your vault password
            protects your personal key.
          </p>
        </div>
        <ul className="space-y-3 text-sm">
          {[
            ["It never leaves this device", "The server never sees your vault password or your keys."],
            ["It's separate from your login", "Resetting your login password doesn't touch your vault."],
            ["It can't be reset by email", "You'll get a recovery key. Keep it safe, it's the only way back in."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-secure" />
              <span>
                <span className="font-medium">{title}.</span> <span className="text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button variant="secure" onClick={() => setStep("password")}>
            Choose a vault password <ArrowRight />
          </Button>
        </div>
      </div>
    )
  }

  if (step === "password") {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (newPassword.valid) void create()
        }}
      >
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold">Choose your vault password</h2>
          <p className="text-muted-foreground text-sm">You'll enter it to unlock secure documents.</p>
        </div>
        {newPassword.fields}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setStep("intro")}>
            Back
          </Button>
          <Button type="submit" variant="secure" disabled={!newPassword.valid}>
            <Lock /> Create my vault
          </Button>
        </div>
      </form>
    )
  }

  if (step === "working") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center" aria-live="polite">
        <Spinner className="size-7 text-secure" />
        <div>
          <p className="font-medium">Creating your keys…</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Tuning the password hashing to this device and generating your keypair. This takes a few seconds.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold">Save your recovery key</h2>
        <p className="text-muted-foreground text-sm">Your vault is ready and unlocked. One last, important step.</p>
      </div>
      {recoveryKey ? <RecoveryKeyPanel recoveryKey={recoveryKey} email={me?.email ?? ""} confirmed={saved} onConfirmedChange={setSaved} /> : null}
      <div className="flex justify-end">
        <Button
          variant="secure"
          disabled={!saved}
          onClick={() => {
            setRecoveryKey(null)
            onDone()
          }}
        >
          Finish
        </Button>
      </div>
    </div>
  )
}

export function SetupVaultDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Once key generation starts, the dialog only closes through "Finish" (recovery key saved).
  const [locked, setLocked] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(next) => !locked && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!locked} onEscapeKeyDown={(e) => locked && e.preventDefault()}>
        <DialogHeader className="sr-only">
          <DialogTitle>Set up your vault</DialogTitle>
          <DialogDescription>Create a vault password and save your recovery key.</DialogDescription>
        </DialogHeader>
        {open ? (
          <SetupVaultFlow
            onStepChange={(step) => setLocked(step === "working" || step === "recovery")}
            onDone={() => {
              setLocked(false)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ---- Key change warning --------------------------------------------------------------------------

export function KeyChangeDialog({ changes, onDone }: { changes: ProjectKeyChange[]; onDone: (handled: ProjectKeyChange[]) => void }) {
  const [busy, setBusy] = useState(false)
  const change = changes[0]
  if (!change) return null
  const trust = async () => {
    setBusy(true)
    try {
      for (const c of changes.filter((x) => x.recipient.user_id === change.recipient.user_id)) await trustAndGrant(c)
      toast.success(`Shared keys with ${change.recipient.name} using their new key.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
      onDone(changes)
    }
  }
  const projects = [...new Set(changes.filter((c) => c.recipient.user_id === change.recipient.user_id).map((c) => c.projectName))]
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onDone(changes)}>
      <DialogContent className="border-destructive/40 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/25">
            <ShieldAlert className="size-5" />
          </div>
          <DialogTitle>{change.recipient.name}'s key has changed</DialogTitle>
          <DialogDescription>
            Before sharing project keys with {change.recipient.name} ({change.recipient.email}) again, confirm the change is
            genuine. This happens when someone resets their vault, but it's also what an attacker controlling the server
            would do to intercept secrets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Previous fingerprint</span>
              <Fingerprint publicKey={change.previous} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">New fingerprint</span>
              <Fingerprint publicKey={change.recipient.public_key} className="bg-destructive/10 text-destructive" />
            </div>
          </div>
          <Alert variant="warning">
            <AlertTitle>Compare it with {change.recipient.name.split(" ")[0]} directly</AlertTitle>
            <AlertDescription>
              Ask them to read the fingerprint from their Vault settings over a call or in person. Only continue if it
              matches exactly. Affects: {projects.join(", ")}.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onDone(changes)}>
            Don't share now
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void trust()}>
            {busy ? <Spinner /> : null} Fingerprint matches, share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
