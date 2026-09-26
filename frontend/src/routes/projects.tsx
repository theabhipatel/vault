import { useState } from "react"
import { Archive, FolderKanban, FolderPlus, Search } from "lucide-react"

import { CreateProjectDialog } from "@/components/create-dialogs"
import { useBreadcrumbs } from "@/components/layout/breadcrumbs"
import { useWorkspaceScope } from "@/components/layout/workspace-context"
import { Page, PageHeader } from "@/components/page"
import { ProjectCard } from "@/components/project-card"
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProjects } from "@/hooks/api"
import { Perm } from "@/lib/permissions"

export function ProjectsPage() {
  const { id, workspace, can } = useWorkspaceScope()
  const { data, isPending, error, refetch } = useProjects(id)
  const [tab, setTab] = useState<"active" | "archived">("active")
  const [filter, setFilter] = useState("")
  const [creating, setCreating] = useState(false)
  useBreadcrumbs([{ label: workspace.name, to: `/w/${id}` }, { label: "Projects" }])

  const projects = data ?? []
  const archivedCount = projects.filter((p) => p.archived_at).length
  const shown = projects
    .filter((p) => (tab === "archived" ? p.archived_at : !p.archived_at))
    .filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <Page>
      <PageHeader
        title="Projects"
        description={
          can(Perm.accessAllProjects)
            ? "Every project in this workspace."
            : "The projects you've been assigned to. Ask a manager to add you to others."
        }
        actions={
          can(Perm.createProjects) ? (
            <Button onClick={() => setCreating(true)}>
              <FolderPlus /> New project
            </Button>
          ) : null
        }
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">
              Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Filter projects" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter projects" />
        </InputGroup>
      </div>

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : shown.length === 0 ? (
        filter ? (
          <EmptyState icon={Search} title="No matching projects" description={`Nothing matches “${filter}”.`} />
        ) : tab === "archived" ? (
          <EmptyState icon={Archive} title="No archived projects" description="Archived projects are read-only and kept here." />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description={can(Perm.createProjects) ? "Create a project to start adding documents." : "You haven't been added to any projects yet."}
            action={
              can(Perm.createProjects) ? (
                <Button onClick={() => setCreating(true)}>
                  <FolderPlus /> New project
                </Button>
              ) : null
            }
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} workspaceId={id} />
          ))}
        </div>
      )}
      <CreateProjectDialog open={creating} onOpenChange={setCreating} workspaceId={id} />
    </Page>
  )
}
