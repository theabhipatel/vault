import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { History, RotateCcw } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { MarkdownView } from "@/components/markdown"
import { ErrorState, ListSkeleton } from "@/components/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useVersions } from "@/hooks/api"
import { client, unwrap } from "@/lib/api"
import { fullDate, relativeTime } from "@/lib/format"
import type { DocumentFull } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  document: DocumentFull
  onRestore: (version: number) => Promise<unknown>
}

export function VersionHistorySheet({ open, onOpenChange, workspaceId, document, onRestore }: Props) {
  const versions = useVersions(workspaceId, document.id, open)
  const [selected, setSelected] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const active = selected ?? document.version

  const preview = useQuery({
    queryKey: ["workspace", workspaceId, "document", document.id, "version", active],
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/documents/{document_id}/versions/{version}", {
          params: { path: { workspace_id: workspaceId, document_id: document.id, version: active } },
        }),
      ),
    enabled: open,
    staleTime: Infinity,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" /> Version history
          </SheetTitle>
          <SheetDescription>Every save is kept. Restoring creates a new version, so nothing is lost.</SheetDescription>
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
                    active === v.version && "bg-accent ring-1 ring-brand/30",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    Version {v.version}
                    {v.version === document.version ? <Badge variant="brand">Current</Badge> : null}
                  </span>
                  <span className="text-muted-foreground block text-xs" title={fullDate(v.created_at)}>
                    {relativeTime(v.created_at)}
                    {v.created_by ? ` · ${v.created_by.name}` : ""}
                  </span>
                  {v.restored_from ? (
                    <span className="text-muted-foreground block text-xs">Restored from v{v.restored_from}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </ScrollArea>
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <p className="truncate text-sm font-medium">{preview.data?.name ?? document.name}</p>
              {document.can_edit && active !== document.version ? (
                <Button size="sm" onClick={() => setConfirming(true)}>
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
                  <MarkdownView source={preview.data.content ?? ""} />
                ) : (
                  <pre className="font-mono text-sm leading-6 whitespace-pre-wrap break-words">{preview.data.content}</pre>
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
