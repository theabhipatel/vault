import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { History, Lock, RotateCcw } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { MarkdownView } from "@/components/markdown"
import { ErrorState, ListSkeleton } from "@/components/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useVersions } from "@/hooks/api"
import { fullDate, relativeTime } from "@/lib/format"
import type { DocumentFull } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  document: DocumentFull
  /** Returns a version's readable content (decrypting it in the browser for secure docs). */
  loadVersion: (version: number) => Promise<{ name: string; content: string }>
  onRestore: (version: number) => Promise<unknown>
}

export function VersionHistorySheet({ open, onOpenChange, workspaceId, document, loadVersion, onRestore }: Props) {
  const versions = useVersions(workspaceId, document.id, open)
  const [selected, setSelected] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const active = selected ?? document.version
  const secure = document.kind === "secure"

  const preview = useQuery({
    queryKey: [secure ? "secure" : "workspace", workspaceId, "document", document.id, "version", active],
    queryFn: () => loadVersion(active),
    enabled: open,
    staleTime: Infinity,
    // Never keep decrypted history around after the sheet closes.
    gcTime: secure ? 0 : 5 * 60_000,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" /> Version history
          </SheetTitle>
          <SheetDescription>
            Every save is kept{secure ? ", encrypted" : ""}. Restoring creates a new version, so nothing is lost.
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[15rem_minmax(0,1fr)]">
          <ScrollArea className="max-h-56 border-b md:max-h-none md:border-r md:border-b-0">
            <div className="space-y-1 p-2">
              {versions.isPending ? <ListSkeleton rows={4} /> : null}
              {versions.error ? <ErrorState error={versions.error} /> : null}
              {versions.data?.map((v) => (
                <button
                  key={v.version}
                  type="button"
                  onClick={() => setSelected(v.version)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    active === v.version && (secure ? "bg-secure-soft ring-1 ring-secure/30" : "bg-accent ring-1 ring-brand/30"),
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    Version {v.version}
                    {v.version === document.version ? <Badge variant={secure ? "secure" : "brand"}>Current</Badge> : null}
                  </span>
                  <span className="text-muted-foreground block text-xs" title={fullDate(v.created_at)}>
                    {relativeTime(v.created_at)}
                    {v.created_by ? ` · ${v.created_by.name}` : ""}
                  </span>
                  {v.restored_from ? <span className="text-muted-foreground block text-xs">Restored from v{v.restored_from}</span> : null}
                </button>
              ))}
            </div>
          </ScrollArea>
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                {secure ? <Lock className="size-3.5 shrink-0 text-secure" /> : null}
                {preview.data?.name ?? document.name}
              </p>
              {document.can_edit && active !== document.version ? (
                <Button size="sm" variant={secure ? "secure" : "default"} onClick={() => setConfirming(true)}>
                  <RotateCcw /> Restore v{active}
                </Button>
              ) : null}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-5">
                {preview.isPending ? (
                  <ListSkeleton rows={2} />
                ) : preview.error ? (
                  <ErrorState error={preview.error} />
                ) : document.format === "markdown" ? (
                  <MarkdownView source={preview.data.content} />
                ) : (
                  <pre className="font-mono text-sm leading-6 break-words whitespace-pre-wrap">
                    {document.format === "env" ? maskEnv(preview.data.content) : preview.data.content}
                  </pre>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Restore version ${active}?`}
          description="The document will be replaced with this version's content. Your current content stays in history."
          confirmLabel="Restore"
          onConfirm={async () => {
            await onRestore(active)
            setSelected(null)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

/** History previews of .env files show keys but keep values masked. */
function maskEnv(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const m = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=)(.*)$/.exec(line)
      return m && m[2].trim() ? `${m[1]}${"•".repeat(Math.min(12, Math.max(6, m[2].trim().length)))}` : line
    })
    .join("\n")
}
