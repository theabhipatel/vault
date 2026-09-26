import { useCallback, useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  Columns2,
  Download,
  Eye,
  History,
  Lock,
  MoreHorizontal,
  PenLine,
  RotateCw,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import { useBlocker, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DocIcon, FormatBadge, KindBadge } from "@/components/doc-badges"
import { useBreadcrumbs } from "@/components/layout/breadcrumbs"
import { useWorkspaceScope } from "@/components/layout/workspace-context"
import { MarkdownView } from "@/components/markdown"
import { Page } from "@/components/page"
import { EmptyState, ErrorState } from "@/components/states"
import { VersionHistorySheet } from "@/components/version-history"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { qk, useDocument } from "@/hooks/api"
import { ApiError, client, errorMessage, unwrap } from "@/lib/api"
import { fullDate, relativeTime } from "@/lib/format"
import type { DocumentFull } from "@/lib/types"
import { cn } from "@/lib/utils"
import { NotFoundContent } from "@/routes/not-found"

type ViewMode = "write" | "split" | "preview"

export function DocumentPage() {
  const { projectId = "", documentId = "" } = useParams()
  const { id, workspace } = useWorkspaceScope()
  const doc = useDocument(id, documentId)

  useBreadcrumbs([
    { label: workspace.name, to: `/w/${id}` },
    { label: doc.data?.project_name ?? "Project", to: `/w/${id}/projects/${projectId}` },
    { label: doc.data?.name ?? "Document" },
  ])

  if (doc.isPending) {
    return (
      <Page wide>
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="h-7 w-72" />
        </div>
        <Skeleton className="h-[60vh] rounded-xl" />
      </Page>
    )
  }
  if (doc.error instanceof ApiError && (doc.error.status === 404 || doc.error.status === 422)) {
    return <NotFoundContent title="Document not found" description="It may have been deleted, or you may not have access to it." />
  }
  if (doc.error || !doc.data) {
    return (
      <Page>
        <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />
      </Page>
    )
  }
  if (doc.data.kind === "secure") {
    return (
      <Page>
        <EmptyState
          icon={Lock}
          title="This document is end-to-end encrypted"
          description="Unlock your vault to read it. Its contents never reach the server in readable form."
          className="border-secure/30 bg-secure-soft/30"
        />
      </Page>
    )
  }
  return <DocumentEditor key={doc.data.id} document={doc.data} workspaceId={id} />
}

function DocumentEditor({ document: doc, workspaceId }: { document: DocumentFull; workspaceId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [content, setContent] = useState(doc.content ?? "")
  const [name, setName] = useState(doc.name)
  const [mode, setMode] = useState<ViewMode>(() => (window.innerWidth >= 1024 ? "split" : "write"))
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [conflict, setConflict] = useState(false)

  const readOnly = !doc.can_edit
  const dirty = content !== (doc.content ?? "") || name.trim() !== doc.name
  const isMarkdown = doc.format === "markdown"

  const setDoc = (next: DocumentFull) => {
    queryClient.setQueryData(qk.document(workspaceId, doc.id), next)
    void queryClient.invalidateQueries({ queryKey: qk.versions(workspaceId, doc.id) })
    void queryClient.invalidateQueries({ queryKey: qk.documents(workspaceId, doc.project_id) })
    void queryClient.invalidateQueries({ queryKey: qk.recent(workspaceId) })
  }

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        client.PATCH("/api/workspaces/{workspace_id}/documents/{document_id}", {
          params: { path: { workspace_id: workspaceId, document_id: doc.id } },
          body: { expected_version: doc.version, content, name: name.trim() || doc.name },
        }),
      ),
    onSuccess: (next) => {
      setConflict(false)
      setDoc(next)
      toast.success(`Saved as version ${next.version}.`)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setConflict(true)
      else toast.error(errorMessage(error))
    },
  })

  const restore = useMutation({
    mutationFn: (version: number) =>
      unwrap(
        client.POST("/api/workspaces/{workspace_id}/documents/{document_id}/versions/{version}/restore", {
          params: { path: { workspace_id: workspaceId, document_id: doc.id, version } },
          body: { expected_version: doc.version },
        }),
      ),
    onSuccess: (next) => {
      setDoc(next)
      setContent(next.content ?? "")
      setName(next.name)
      setHistoryOpen(false)
      toast.success(`Restored. The document is now version ${next.version}.`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () =>
      unwrap(
        client.DELETE("/api/workspaces/{workspace_id}/documents/{document_id}", {
          params: { path: { workspace_id: workspaceId, document_id: doc.id } },
        }),
      ),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: qk.documents(workspaceId, doc.project_id) })
      await queryClient.invalidateQueries({ queryKey: qk.projects(workspaceId) })
      queryClient.removeQueries({ queryKey: qk.document(workspaceId, doc.id) })
      toast.success(res.message)
      navigate(`/w/${workspaceId}/projects/${doc.project_id}`, { replace: true })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const reloadLatest = async () => {
    await queryClient.refetchQueries({ queryKey: qk.document(workspaceId, doc.id) })
    const latest = queryClient.getQueryData<DocumentFull>(qk.document(workspaceId, doc.id))
    if (latest) {
      setContent(latest.content ?? "")
      setName(latest.name)
    }
    setConflict(false)
  }

  const canSave = dirty && !readOnly && !save.isPending && name.trim().length > 0
  const trySave = useCallback(() => {
    if (canSave) save.mutate()
  }, [canSave, save])

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        trySave()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [trySave])

  // Warn before losing unsaved changes: in-app navigation and tab close / reload.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !remove.isSuccess && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  const download = () => {
    const blob = new Blob([content], { type: isMarkdown ? "text/markdown" : "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement("a")
    a.href = url
    const safe = (name.trim() || "document").replace(/[^\w.-]+/g, "-")
    a.download = /\.(md|txt)$/i.test(safe) ? safe : `${safe}.${isMarkdown ? "md" : "txt"}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const showEditor = !readOnly && (mode === "write" || mode === "split" || !isMarkdown)
  const showPreview = isMarkdown && (readOnly || mode === "preview" || mode === "split")

  return (
    <Page wide className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <DocIcon kind={doc.kind} format={doc.format} className="size-10" />
          <div className="min-w-0 flex-1">
            {readOnly ? (
              <h1 className="truncate text-xl font-semibold">{doc.name}</h1>
            ) : (
              <input
                aria-label="Document name"
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                className="font-heading w-full min-w-0 truncate rounded-md bg-transparent px-1 -ml-1 text-xl font-semibold tracking-tight outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            )}
            <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <KindBadge kind={doc.kind} />
              <FormatBadge format={doc.format} />
              <span title={fullDate(doc.updated_at)}>
                v{doc.version} · edited {relativeTime(doc.updated_at)}
                {doc.updated_by ? ` by ${doc.updated_by.name}` : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isMarkdown && !readOnly ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={mode}
              onValueChange={(v) => {
                if (v) setMode(v as ViewMode)
              }}
              aria-label="Editor layout"
            >
              <ToggleGroupItem value="write" aria-label="Write">
                <PenLine />
              </ToggleGroupItem>
              <ToggleGroupItem value="split" aria-label="Split view" className="hidden md:inline-flex">
                <Columns2 />
              </ToggleGroupItem>
              <ToggleGroupItem value="preview" aria-label="Preview">
                <Eye />
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History /> History
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={download}>
                <Download /> Download
              </DropdownMenuItem>
              {doc.can_delete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                    <Trash2 /> Delete document
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {!readOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={trySave} disabled={!canSave}>
                  {save.isPending ? <Spinner /> : dirty ? <Save /> : <Check />}
                  {dirty ? "Save" : "Saved"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Save <Kbd>Ctrl S</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <Alert className="mb-4 py-2.5">
        <Eye />
        <AlertDescription className="text-xs">
          Normal document: protected by access control, but readable by the server. Keep passwords and keys in a secure
          document instead.
        </AlertDescription>
      </Alert>

      {conflict ? (
        <Alert variant="warning" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Someone else saved a newer version</AlertTitle>
          <AlertDescription>
            Your changes weren't saved. Copy anything you need, then load the latest version.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void reloadLatest()}>
              <RotateCw /> Load latest
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {readOnly ? (
        <p className="text-muted-foreground mb-3 text-xs">You can view this document but not edit it.</p>
      ) : null}

      <div
        className={cn(
          "grid min-h-[60vh] flex-1 overflow-hidden rounded-xl border bg-card shadow-xs",
          showEditor && showPreview ? "md:grid-cols-2" : "grid-cols-1",
        )}
      >
        {showEditor ? (
          <Textarea
            aria-label="Document content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={isMarkdown}
            placeholder={isMarkdown ? "# Start writing in Markdown…" : "Start typing…"}
            className="min-h-[60vh] resize-none rounded-none border-0 bg-transparent p-5 font-mono text-[0.9rem] leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        ) : null}
        {showPreview ? (
          <div className={cn("min-h-[60vh] overflow-y-auto p-6", showEditor && "border-t bg-surface/50 md:border-t-0 md:border-l")}>
            {content.trim() ? (
              <MarkdownView source={content} />
            ) : (
              <p className="text-muted-foreground text-sm italic">Nothing to preview yet.</p>
            )}
          </div>
        ) : null}
        {readOnly && !isMarkdown ? (
          <pre className="min-h-[60vh] p-5 font-mono text-[0.9rem] leading-7 whitespace-pre-wrap break-words">{content}</pre>
        ) : null}
      </div>

      <VersionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        workspaceId={workspaceId}
        document={doc}
        onRestore={(v) => restore.mutateAsync(v)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${doc.name}?`}
        description="The document and its entire version history will be permanently deleted."
        confirmLabel="Delete document"
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(o) => {
          if (!o && blocker.state === "blocked") blocker.reset()
        }}
        title="Discard unsaved changes?"
        description="You have edits that haven't been saved. If you leave now they'll be lost."
        confirmLabel="Discard and leave"
        destructive
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed()
        }}
      />
    </Page>
  )
}
