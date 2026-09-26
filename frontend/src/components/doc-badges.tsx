import { FileCode2, FileText, KeyRound, Lock, NotebookText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { DocFormat, DocKind } from "@/lib/types"
import { cn } from "@/lib/utils"

export const FORMAT_LABEL: Record<DocFormat, string> = {
  text: "Plain text",
  markdown: "Markdown",
  env: ".env",
}

export function DocIcon({ kind, format, className }: { kind: DocKind; format: DocFormat; className?: string }) {
  const Icon = format === "env" ? KeyRound : format === "markdown" ? NotebookText : kind === "secure" ? FileCode2 : FileText
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
        kind === "secure" ? "bg-secure-soft text-secure ring-secure/25" : "bg-muted text-muted-foreground ring-border",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
      {kind === "secure" ? (
        <span className="absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full bg-secure text-secure-foreground ring-2 ring-card">
          <Lock className="size-2.5" strokeWidth={3} />
        </span>
      ) : null}
    </span>
  )
}

export function KindBadge({ kind, className }: { kind: DocKind; className?: string }) {
  if (kind === "secure") {
    return (
      <Badge variant="secure" className={className}>
        <Lock /> Secure
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className={className}>
      Normal
    </Badge>
  )
}

export function FormatBadge({ format }: { format: DocFormat }) {
  return <Badge variant="outline">{FORMAT_LABEL[format]}</Badge>
}
