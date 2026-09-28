import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { fingerprint } from "@/vault/crypto"

/** Computes a public key's fingerprint in the browser (never trusts a server-provided one). */
export function useFingerprint(publicKey: string | null | undefined): string | null {
  const [value, setValue] = useState<{ key: string; fp: string } | null>(null)
  useEffect(() => {
    if (!publicKey) return
    let cancelled = false
    void fingerprint(publicKey).then((fp) => {
      if (!cancelled) setValue({ key: publicKey, fp })
    })
    return () => {
      cancelled = true
    }
  }, [publicKey])
  return publicKey && value?.key === publicKey ? value.fp : null
}

export function Fingerprint({ publicKey, className }: { publicKey: string | null | undefined; className?: string }) {
  const fp = useFingerprint(publicKey)
  if (!publicKey) return <span className={cn("text-muted-foreground text-xs", className)}>No key yet</span>
  return (
    <code
      className={cn("rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.72rem] tracking-wide whitespace-nowrap", className)}
      title="Key fingerprint: compare it with this person over another channel"
    >
      {fp ?? "…"}
    </code>
  )
}
