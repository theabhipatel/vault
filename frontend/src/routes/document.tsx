import { useCallback, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  Clock,
  Columns2,
  Download,
  Eye,
  History,
  KeyRound,
  Lock,
  MoreHorizontal,
  PenLine,
  RotateCw,
  Save,
  ShieldCheck,
  ShieldPlus,
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
import { EnvEditor } from "@/components/vault/env-editor"
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
import { reportDocumentEvent } from "@/vault/audit"
import { DecryptionError } from "@/vault/crypto"
import { getProjectVault, openSecureDocument, openSecureVersion, saveSecureDocument } from "@/vault/protocol"
import { useVault } from "@/vault/vault-context"

type ViewMode = "write" | "split" | "preview"

/** How the editor loads and stores content: in the clear (normal) or encrypted (secure). */
interface EditorBackend {
  save: (doc: DocumentFull, content: string, name: string) => Promise<DocumentFull>
  reload: (doc: DocumentFull) => Promise<{ doc: DocumentFull; content: string }>
  restore: (doc: DocumentFull, version: number) => Promise<{ doc: DocumentFull; content: string }>
  loadVersion: (doc: DocumentFull, version: number) => Promise<{ name: string; content: string }>
}

async function fetchDocument(workspaceId: string, documentId: string): Promise<DocumentFull> {
  return unwrap(
    client.GET("/api/workspaces/{workspace_id}/documents/{document_id}", {
      params: { path: { workspace_id: workspaceId, document_id: documentId } },
    }),
  )
}

async function fetchVersion(workspaceId: string, documentId: string, version: number) {
  return unwrap(
    client.GET("/api/workspaces/{workspace_id}/documents/{document_id}/versions/{version}", {
      params: { path: { workspace_id: workspaceId, document_id: documentId, version } },
    }),
  )
}

function normalBackend(workspaceId: string): EditorBackend {
  return {
    save: (doc, content, name) =>
      unwrap(
        client.PATCH("/api/workspaces/{workspace_id}/documents/{document_id}", {
          params: { path: { workspace_id: workspaceId, document_id: doc.id } },
          body: { expected_version: doc.version, content, name },
        }),
      ),
    reload: async (doc) => {
      const next = await fetchDocument(workspaceId, doc.id)
      return { doc: next, content: next.content ?? "" }
    },
    restore: async (doc, version) => {
      const next = await unwrap(
        client.POST("/api/workspaces/{workspace_id}/documents/{document_id}/versions/{version}/restore", {
          params: { path: { workspace_id: workspaceId, document_id: doc.id, version } },
          body: { expected_version: doc.version },
        }),
      )
      return { doc: next, content: next.content ?? "" }
    },
    loadVersion: async (doc, version) => {
      const v = await fetchVersion(workspaceId, doc.id, version)
      return { name: v.name, content: v.content ?? "" }
    },
  }
}

function secureBackend(workspaceId: string): EditorBackend {
  return {
    save: (doc, content, name) => saveSecureDocument(workspaceId, doc, content, { name }),
    reload: async (doc) => {
      const next = await fetchDocument(workspaceId, doc.id)
      return { doc: next, content: await openSecureDocument(workspaceId, next) }
    },
    restore: async (doc, version) => {
      // Decrypt the old version here, then save it as a new version (re-encrypted, new AAD).
      const old = await fetchVersion(workspaceId, doc.id, version)
      const content = await openSecureVersion(workspaceId, doc, old)
      const next = await saveSecureDocument(workspaceId, doc, content, { name: old.name, restoredFrom: version })
      return { doc: next, content }
    },
    loadVersion: async (doc, version) => {
      const v = await fetchVersion(workspaceId, doc.id, version)
      return { name: v.name, content: await openSecureVersion(workspaceId, doc, v) }
    },
  }
}

export function DocumentPage() {
  const { projectId = "", documentId = "" } = useParams()
  const { id, workspace } = useWorkspaceScope()
  const doc = useDocument(id, documentId)

  useBreadcrumbs([
    { label: workspace.name, to: `/w/${id}` },
    { label: doc.data?.project_name ?? "Project", to: `/w/${id}/projects/${projectId}` },
    { label: doc.data?.name ?? "Document" },
  ])

  if (doc.isPending) return <EditorSkeleton />
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
  if (doc.data.kind === "secure") return <SecureDocument document={doc.data} workspaceId={id} />
  return (
    <DocumentEditor
      key={doc.data.id}
      document={doc.data}
      workspaceId={id}
      initialContent={doc.data.content ?? ""}
      backend={normalBackend(id)}
    />
  )
}

function EditorSkeleton() {
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

function LockedDocument({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Page>
      <EmptyState icon={Lock} title={title} description={description} action={action} className="border-secure/30 bg-secure-soft/30 py-16" />
    </Page>
  )
}

/** Secure documents: decrypted here, only while the vault is unlocked. */
function SecureDocument({ document: doc, workspaceId }: { document: DocumentFull; workspaceId: string }) {
  const vault = useVault()
  const unlocked = vault.status === "unlocked"
  const state = useQuery({
    queryKey: ["project-vault", workspaceId, doc.project_id],
    queryFn: () => getProjectVault(workspaceId, doc.project_id),
    enabled: unlocked,
  })
  const ready = unlocked && state.data?.my_state === "ready"
  // Keyed by document only: after saving, the editor keeps its own plaintext (no refetch).
  const plaintext = useQuery({
    queryKey: ["secure", workspaceId, "content", doc.id],
    queryFn: () => openSecureDocument(workspaceId, doc),
    enabled: ready,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })

  if (vault.status === "loading") return <EditorSkeleton />
  if (vault.status === "none") {
    return (
      <LockedDocument
        title="Set up your vault to open this document"
        description="Secure documents are end-to-end encrypted. You need your own vault keys before teammates can share access with you."
        action={
          <Button variant="secure" onClick={vault.openSetup}>
            <ShieldPlus /> Set up your vault
          </Button>
        }
      />
    )
  }
  if (vault.status === "locked") {
    return (
      <LockedDocument
        title="This document is end-to-end encrypted"
        description="Unlock your vault to decrypt it in this browser. Its contents never reach the server in readable form."
        action={
          <Button variant="secure" onClick={vault.openUnlock}>
            <KeyRound /> Unlock vault
          </Button>
        }
      />
    )
  }
  if (state.isPending) return <EditorSkeleton />
  if (state.error) {
    return (
      <Page>
        <ErrorState error={state.error} onRetry={() => void state.refetch()} />
      </Page>
    )
  }
  if (state.data.my_state === "pending") {
    return (
      <LockedDocument
        title="Secure access pending"
        description="A teammate who holds this project's key will share it with you automatically the next time their vault is unlocked. You'll get a notification."
      />
    )
  }
  if (state.data.my_state === "lost") {
    return (
      <LockedDocument
        title="This document can't be decrypted"
        description="Nobody holds this project's key any more (for example after the only key holder reset their vault). The content is permanently unreadable."
      />
    )
  }
  if (state.data.my_state !== "ready") {
    return <LockedDocument title="No secure access" description="Your role doesn't include access to secure documents in this project." />
  }
  if (plaintext.isPending) return <EditorSkeleton />
  if (plaintext.error) {
    return (
      <Page>
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Couldn't decrypt this document</AlertTitle>
          <AlertDescription>
            {plaintext.error instanceof DecryptionError
              ? "Its encrypted data failed integrity checks. It may have been tampered with, or bound to a different location."
              : errorMessage(plaintext.error)}
          </AlertDescription>
        </Alert>
      </Page>
    )
  }
  return (
    <DocumentEditor
      key={doc.id}
      document={doc}
      workspaceId={workspaceId}
      initialContent={plaintext.data}
      backend={secureBackend(workspaceId)}
    />
  )
}

function DocumentEditor({
  document: doc,
  workspaceId,
  initialContent,
  backend,
}: {
  document: DocumentFull
  workspaceId: string
  initialContent: string
  backend: EditorBackend
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [saved, setSaved] = useState({ content: initialContent, name: doc.name })
  const [content, setContent] = useState(initialContent)
  const [name, setName] = useState(doc.name)
  // Bumped when content is replaced from outside (restore, reload) so child editors re-read it.
  const [epoch, setEpoch] = useState(0)
  // Documents open read-only ("View"); editing is one click away. A new, empty document opens
  // for editing, since there is nothing to read yet.
  const [mode, setMode] = useState<ViewMode>(() => (doc.can_edit && !initialContent.trim() ? "write" : "preview"))
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false)

  const secure = doc.kind === "secure"
  const readOnly = !doc.can_edit
  const dirty = content !== saved.content || name.trim() !== saved.name
  const isMarkdown = doc.format === "markdown"
  const isEnv = doc.format === "env"

  const setDoc = useCallback(
    (next: DocumentFull) => {
      queryClient.setQueryData(qk.document(workspaceId, doc.id), next)
      void queryClient.invalidateQueries({ queryKey: qk.versions(workspaceId, doc.id) })
      void queryClient.invalidateQueries({ queryKey: qk.documents(workspaceId, doc.project_id) })
      void queryClient.invalidateQueries({ queryKey: qk.recent(workspaceId) })
    },
    [queryClient, workspaceId, doc.id, doc.project_id],
  )

  const replaceContent = (next: { doc: DocumentFull; content: string }) => {
    setDoc(next.doc)
    setContent(next.content)
    setName(next.doc.name)
    setSaved({ content: next.content, name: next.doc.name })
    setEpoch((e) => e + 1)
  }

  const save = useMutation({
    mutationFn: () => backend.save(doc, content, name.trim() || doc.name),
    onSuccess: (next, _vars) => {
      setConflict(false)
      setSaved({ content, name: next.name })
      setDoc(next)
      toast.success(`Saved as version ${next.version}${secure ? ", encrypted" : ""}.`)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && /saved|changed/i.test(error.message)) setConflict(true)
      else toast.error(errorMessage(error))
    },
  })

  const restore = useMutation({
    mutationFn: (version: number) => backend.restore(doc, version),
    onSuccess: (next) => {
      replaceContent(next)
      setHistoryOpen(false)
      toast.success(`Restored. The document is now version ${next.doc.version}.`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const reload = useMutation({
    mutationFn: () => backend.reload(doc),
    onSuccess: (next) => {
      replaceContent(next)
      setConflict(false)
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

  const canSave = dirty && !readOnly && !save.isPending && name.trim().length > 0
  const trySave = useCallback(() => {
    if (canSave) save.mutate()
  }, [canSave, save])

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
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !remove.isSuccess && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  const download = () => {
    const blob = new Blob([content], { type: isMarkdown ? "text/markdown" : "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement("a")
    a.href = url
    const safe = (name.trim() || "document").replace(/[^\w.-]+/g, "-")
    a.download = /\.(md|txt|env)$/i.test(safe) ? safe : `${safe}.${isMarkdown ? "md" : isEnv ? "env" : "txt"}`
    a.click()
    URL.revokeObjectURL(url)
    if (secure) {
      reportDocumentEvent(workspaceId, doc.id, { event: "downloaded", version: doc.version })
      toast("Downloaded. This copy is no longer encrypted.")
    }
  }

  const history = useMemo(
    () => ({ loadVersion: (v: number) => backend.loadVersion(doc, v) }),
    [backend, doc],
  )

  const viewing = readOnly || mode === "preview"
  const showEditor = !viewing && (mode === "write" || (isMarkdown && mode === "split"))
  const showPreview = isMarkdown && (viewing || mode === "split")

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
                className="font-heading -ml-1 w-full min-w-0 truncate rounded-md bg-transparent px-1 text-xl font-semibold tracking-tight outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
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
          {!readOnly ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={!isMarkdown && mode === "split" ? "write" : mode}
              onValueChange={(v) => {
                if (v) setMode(v as ViewMode)
              }}
              aria-label="Document mode"
            >
              <ToggleGroupItem value="preview" aria-label="View" title="View">
                <Eye /> <span className="hidden sm:inline">View</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="write" aria-label="Edit" title="Edit">
                <PenLine /> <span className="hidden sm:inline">Edit</span>
              </ToggleGroupItem>
              {isMarkdown ? (
                <ToggleGroupItem value="split" aria-label="Edit with live preview" title="Edit with live preview" className="hidden md:inline-flex">
                  <Columns2 />
                </ToggleGroupItem>
              ) : null}
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
                <Button size="sm" variant={secure ? "secure" : "default"} onClick={trySave} disabled={!canSave}>
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

      {secure ? (
        <Alert variant="secure" className="mb-4 py-2.5">
          <ShieldCheck />
          <AlertDescription className="text-xs">
            End-to-end encrypted. Decrypted only in this browser; the server stores ciphertext. The document's name is not
            encrypted, so never put secrets in it.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-4 py-2.5">
          <Eye />
          <AlertDescription className="text-xs">
            Normal document: protected by access control, but readable by the server. Keep passwords and keys in a secure
            document instead.
          </AlertDescription>
        </Alert>
      )}

      {conflict ? (
        <Alert variant="warning" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Someone else saved a newer version</AlertTitle>
          <AlertDescription>Your changes weren't saved. Copy anything you need, then load the latest version.</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" disabled={reload.isPending} onClick={() => setConfirmReload(true)}>
              {reload.isPending ? <Spinner /> : <RotateCw />} Load latest
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {readOnly ? (
        <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs">
          <Clock className="size-3.5" /> You can view this document but not edit it.
        </p>
      ) : null}

      <div
        className={cn(
          "grid min-h-[60vh] flex-1 overflow-hidden rounded-xl border bg-card shadow-xs",
          secure && "border-secure/30",
          showEditor && showPreview && !isEnv ? "md:grid-cols-2" : "grid-cols-1",
        )}
      >
        {isEnv ? (
          <EnvEditor
            key={epoch}
            value={content}
            onChange={setContent}
            readOnly={viewing}
            fileName={name.trim() || "secrets.env"}
            onAudit={secure ? (event, count) => reportDocumentEvent(workspaceId, doc.id, { event, count, version: doc.version }) : undefined}
          />
        ) : (
          <>
            {showEditor ? (
              <Textarea
                aria-label="Document content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={isMarkdown && !secure}
                placeholder={isMarkdown ? "# Start writing in Markdown…" : "Start typing…"}
                className="min-h-[60vh] resize-none rounded-none border-0 bg-transparent p-5 font-mono text-[0.9rem] leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
            ) : null}
            {showPreview ? (
              <div className={cn("min-h-[60vh] overflow-y-auto p-6", showEditor && "border-t bg-surface/50 md:border-t-0 md:border-l")}>
                {content.trim() ? <MarkdownView source={content} /> : <p className="text-muted-foreground text-sm italic">Nothing to preview yet.</p>}
              </div>
            ) : null}
            {viewing && !isMarkdown ? (
              <pre className="min-h-[60vh] p-5 font-mono text-[0.9rem] leading-7 break-words whitespace-pre-wrap">{content || <span className="text-muted-foreground font-sans text-sm italic">This document is empty.</span>}</pre>
            ) : null}
          </>
        )}
      </div>

      <VersionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        workspaceId={workspaceId}
        document={doc}
        loadVersion={history.loadVersion}
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
        open={confirmReload}
        onOpenChange={setConfirmReload}
        title="Load the latest version?"
        description="Your unsaved changes will be replaced by the version someone else saved. Copy anything you need first."
        confirmLabel="Discard my changes"
        destructive
        onConfirm={() => reload.mutateAsync()}
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
