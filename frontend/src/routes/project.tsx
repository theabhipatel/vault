import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  ArchiveRestore,
  FilePlus2,
  FileText,
  Globe,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react"
import { useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { DocumentRow } from "@/components/document-list"
import { useBreadcrumbs } from "@/components/layout/breadcrumbs"
import { useWorkspaceScope } from "@/components/layout/workspace-context"
import { NewDocumentDialog } from "@/components/new-document-dialog"
import { Page, PageHeader } from "@/components/page"
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states"
import { UserAvatar } from "@/components/user-avatar"
import { ProjectVaultBanner } from "@/components/vault/project-vault-banner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { qk, useDocuments, useMembers, useProject, useProjectMembers } from "@/hooks/api"
import { ApiError, client, errorMessage, unwrap } from "@/lib/api"
import { relativeTime, shortDate } from "@/lib/format"
import { Perm } from "@/lib/permissions"
import type { Project } from "@/lib/types"
import { NotFoundContent } from "@/routes/not-found"

type KindFilter = "all" | "normal" | "secure"

export function ProjectPage() {
  const { projectId = "" } = useParams()
  const { id, workspace, can } = useWorkspaceScope()
  const project = useProject(id, projectId)
  const [tab, setTab] = useState("documents")
  const [newDoc, setNewDoc] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useBreadcrumbs([
    { label: workspace.name, to: `/w/${id}` },
    { label: "Projects", to: `/w/${id}/projects` },
    { label: project.data?.name ?? "Project" },
  ])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.project(id, projectId) }),
      queryClient.invalidateQueries({ queryKey: qk.projects(id) }),
    ])
  }

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      unwrap(
        archived
          ? client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/unarchive", {
              params: { path: { workspace_id: id, project_id: projectId } },
            })
          : client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/archive", {
              params: { path: { workspace_id: id, project_id: projectId } },
            }),
      ),
    onSuccess: async (p) => {
      await invalidate()
      toast.success(p.archived_at ? "Project archived. It's now read-only." : "Project restored.")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (confirmName: string) =>
      unwrap(
        client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/delete", {
          params: { path: { workspace_id: id, project_id: projectId } },
          body: { confirm_name: confirmName },
        }),
      ),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: qk.projects(id) })
      toast.success(res.message)
      navigate(`/w/${id}/projects`, { replace: true })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (project.isPending) {
    return (
      <Page>
        <Skeleton className="mb-3 h-8 w-64" />
        <Skeleton className="mb-8 h-4 w-96 max-w-full" />
        <ListSkeleton rows={5} />
      </Page>
    )
  }
  if (project.error instanceof ApiError && (project.error.status === 404 || project.error.status === 422)) {
    return <NotFoundContent title="Project not found" description="It may have been deleted, or you may not have access to it." />
  }
  if (project.error || !project.data) {
    return (
      <Page>
        <ErrorState error={project.error} onRetry={() => void project.refetch()} />
      </Page>
    )
  }

  const p = project.data
  const archived = Boolean(p.archived_at)
  const canCreateDocs = !archived && (can(Perm.editDocs) || can(Perm.editSecure))

  return (
    <Page>
      <PageHeader
        eyebrow="Project"
        title={
          <span className="inline-flex items-center gap-3">
            {p.name}
            {archived ? (
              <Badge variant="secondary">
                <Archive /> Archived
              </Badge>
            ) : null}
          </span>
        }
        description={p.description || undefined}
        actions={
          <>
            {canCreateDocs ? (
              <Button onClick={() => setNewDoc(true)}>
                <FilePlus2 /> New document
              </Button>
            ) : null}
            {p.can_edit ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Project actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {!archived ? (
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      <Pencil /> Edit details
                    </DropdownMenuItem>
                  ) : null}
                  {archived ? (
                    <DropdownMenuItem onSelect={() => archive.mutate(true)}>
                      <ArchiveRestore /> Restore project
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setConfirm("archive")}>
                      <Archive /> Archive project
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                    <Trash2 /> Delete project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      {archived ? (
        <Alert className="mb-6">
          <Archive />
          <AlertTitle>This project is archived</AlertTitle>
          <AlertDescription>
            Everything is read-only. {p.can_edit ? "Restore it from the project menu to make changes." : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <ProjectVaultBanner workspaceId={id} project={p} canDeleteSecure={can(Perm.deleteSecure)} />

      <div className="text-muted-foreground mb-6 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span>Created {shortDate(p.created_at)}{p.created_by ? ` by ${p.created_by.name}` : ""}</span>
        <span>Last activity {relativeTime(p.last_activity_at)}</span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="documents">
            <FileText /> Documents
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users /> Members
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-5">
          <DocumentsTab workspaceId={id} project={p} canCreate={canCreateDocs} onCreate={() => setNewDoc(true)} />
        </TabsContent>
        <TabsContent value="members" className="mt-5">
          <MembersTab workspaceId={id} project={p} />
        </TabsContent>
      </Tabs>

      <NewDocumentDialog
        open={newDoc}
        onOpenChange={setNewDoc}
        workspaceId={id}
        projectId={p.id}
        canCreateNormal={can(Perm.editDocs)}
        canCreateSecure={can(Perm.editSecure)}
      />
      <EditProjectDialog open={editing} onOpenChange={setEditing} workspaceId={id} project={p} onSaved={invalidate} />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => setConfirm(o ? "archive" : null)}
        title={`Archive ${p.name}?`}
        description="Archived projects become read-only for everyone. You can restore it at any time."
        confirmLabel="Archive project"
        onConfirm={() => archive.mutateAsync(false)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => setConfirm(o ? "delete" : null)}
        title={`Delete ${p.name}?`}
        description={
          <>
            <p>
              This permanently deletes the project and all {p.document_count} of its documents, including every version.
            </p>
            {p.secure_document_count > 0 ? (
              <p className="text-secure font-medium">{p.secure_document_count} secure documents will be destroyed with their keys.</p>
            ) : null}
            <p>This cannot be undone.</p>
          </>
        }
        confirmLabel="Delete project"
        destructive
        confirmText={p.name}
        onConfirm={(typed) => remove.mutateAsync(typed)}
      />
    </Page>
  )
}

function DocumentsTab({
  workspaceId,
  project,
  canCreate,
  onCreate,
}: {
  workspaceId: string
  project: Project
  canCreate: boolean
  onCreate: () => void
}) {
  const docs = useDocuments(workspaceId, project.id)
  const [filter, setFilter] = useState<KindFilter>("all")
  if (docs.isPending) return <ListSkeleton rows={4} />
  if (docs.error) return <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />
  const shown = docs.data.filter((d) => filter === "all" || d.kind === filter)
  if (docs.data.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents yet"
        description="Add runbooks and notes as normal documents, and keep credentials in end-to-end encrypted secure documents."
        action={
          canCreate ? (
            <Button onClick={onCreate}>
              <FilePlus2 /> New document
            </Button>
          ) : null
        }
      />
    )
  }
  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={filter}
        onValueChange={(v) => {
          if (v) setFilter(v as KindFilter)
        }}
        className="justify-start"
      >
        <ToggleGroupItem value="all" className="px-3">All</ToggleGroupItem>
        <ToggleGroupItem value="normal" className="px-3">
          <Globe /> Normal
        </ToggleGroupItem>
        <ToggleGroupItem value="secure" className="px-3">
          <Lock /> Secure
        </ToggleGroupItem>
      </ToggleGroup>
      <Card className="py-2">
        <CardContent className="px-2">
          {shown.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">No {filter} documents in this project.</p>
          ) : (
            shown.map((doc) => <DocumentRow key={doc.id} doc={doc} workspaceId={workspaceId} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MembersTab({ workspaceId, project }: { workspaceId: string; project: Project }) {
  const members = useProjectMembers(workspaceId, project.id)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: (userId: string) =>
      unwrap(
        client.DELETE("/api/workspaces/{workspace_id}/projects/{project_id}/members/{user_id}", {
          params: { path: { workspace_id: workspaceId, project_id: project.id, user_id: userId } },
        }),
      ),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: qk.projectMembers(workspaceId, project.id) })
      await queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) })
      toast.success(res.message)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (members.isPending) return <ListSkeleton rows={3} />
  if (members.error) return <ErrorState error={members.error} onRetry={() => void members.refetch()} />

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          People who can see this project. Roles with access to all projects are listed automatically.
        </p>
        {project.can_manage_members ? (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <UserPlus /> Add members
          </Button>
        ) : null}
      </div>
      <Card className="py-2">
        <CardContent className="divide-y px-2">
          {members.data.map((m) => (
            <div key={m.user.id} className="flex items-center gap-3 px-2 py-3">
              <UserAvatar name={m.user.name} src={m.user.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.user.name}</p>
                <p className="text-muted-foreground truncate text-xs">{m.user.email}</p>
              </div>
              <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                <Badge variant="outline">{m.role_name}</Badge>
                {m.via_all_access ? <Badge variant="brand">All projects</Badge> : null}
              </div>
              {m.can_remove ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${m.user.name} from project`}
                  onClick={() => setRemoving({ id: m.user.id, name: m.user.name })}
                >
                  <UserMinus />
                </Button>
              ) : (
                <span className="size-8" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <AddProjectMembersDialog
        open={adding}
        onOpenChange={setAdding}
        workspaceId={workspaceId}
        projectId={project.id}
        existing={new Set(members.data.map((m) => m.user.id))}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""} from ${project.name}?`}
        description="They'll immediately lose access to this project's documents. If they could read secure documents, the project key will be rotated."
        confirmLabel="Remove"
        destructive
        onConfirm={() => (removing ? remove.mutateAsync(removing.id) : undefined)}
      />
    </div>
  )
}

function AddProjectMembersDialog({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  existing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  projectId: string
  existing: Set<string>
}) {
  const members = useMembers(workspaceId)
  const [selected, setSelected] = useState<string[]>([])
  const queryClient = useQueryClient()
  const add = useMutation({
    mutationFn: () =>
      unwrap(
        client.POST("/api/workspaces/{workspace_id}/projects/{project_id}/members", {
          params: { path: { workspace_id: workspaceId, project_id: projectId } },
          body: { user_ids: selected },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.projectMembers(workspaceId, projectId) })
      await queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) })
      await queryClient.invalidateQueries({ queryKey: qk.projects(workspaceId) })
      toast.success(`Added ${selected.length} ${selected.length === 1 ? "person" : "people"}.`)
      setSelected([])
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const candidates = (members.data ?? []).filter((m) => !existing.has(m.user_id))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add members</DialogTitle>
          <DialogDescription>Choose workspace members to give access to this project.</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto py-2">
          {members.isPending ? (
            <ListSkeleton rows={3} />
          ) : candidates.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Everyone in the workspace already has access.</p>
          ) : (
            candidates.map((m) => {
              const checked = selected.includes(m.user_id)
              return (
                <label key={m.user_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, m.user_id] : s.filter((x) => x !== m.user_id)))
                    }
                  />
                  <UserAvatar name={m.name} src={m.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">{m.role_name}</span>
                  </span>
                </label>
              )
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={selected.length === 0 || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? <Spinner /> : null} Add {selected.length > 0 ? selected.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditProjectDialog({
  open,
  onOpenChange,
  workspaceId,
  project,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  project: Project
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        client.PATCH("/api/workspaces/{workspace_id}/projects/{project_id}", {
          params: { path: { workspace_id: workspaceId, project_id: project.id } },
          body: { name: name.trim(), description },
        }),
      ),
    onSuccess: async () => {
      await onSaved()
      toast.success("Project updated.")
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setName(project.name)
          setDescription(project.description)
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) save.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <Field>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input id="edit-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea id="edit-description" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {save.isPending ? <Spinner /> : null} Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
