import { useState } from "react"
import { Check, Copy, Download, KeyRound } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { copyText } from "@/lib/clipboard"

/** Shows a recovery key exactly once, with copy/download and an explicit "saved it" check. */
export function RecoveryKeyPanel({
  recoveryKey,
  email,
  confirmed,
  onConfirmedChange,
}: {
  recoveryKey: string
  email: string
  confirmed: boolean
  onConfirmedChange: (value: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  const groups = recoveryKey.split("-")

  const copy = async () => {
    try {
      await copyText(recoveryKey, { secret: true })
      setCopied(true)
      toast.success("Recovery key copied. The clipboard clears in 30 seconds.")
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy. Select the key and copy it manually.")
    }
  }

  const download = () => {
    const text = [
      "Vault recovery key",
      `Account: ${email}`,
      `Created: ${new Date().toISOString()}`,
      "",
      recoveryKey,
      "",
      "Keep this somewhere safe and offline (a password manager or printed copy).",
      "It is the only way to recover your vault if you forget your vault password.",
      "Nobody, including the server operators, can recover it for you.",
    ].join("\n")
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "vault-recovery-key.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-secure/30 bg-secure-soft/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-secure" /> Your recovery key
        </div>
        <div
          className="grid grid-cols-3 gap-x-3 gap-y-2 font-mono text-[0.95rem] font-semibold tracking-wider select-all sm:grid-cols-5"
          aria-label={`Recovery key: ${recoveryKey}`}
        >
          {groups.map((g, i) => (
            <span key={i} className="rounded-md bg-card px-2 py-1 text-center ring-1 ring-border">
              {g}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={download}>
            <Download /> Download .txt
          </Button>
        </div>
      </div>
      <Alert variant="warning">
        <AlertDescription>
          This is shown only once. It's the only way back into your vault if you forget your vault password. Store it
          somewhere safe that isn't this browser.
        </AlertDescription>
      </Alert>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-3 text-sm">
        <Checkbox className="mt-0.5" checked={confirmed} onCheckedChange={(v) => onConfirmedChange(v === true)} />
        <span>I have saved my recovery key somewhere safe.</span>
      </label>
    </div>
  )
}
