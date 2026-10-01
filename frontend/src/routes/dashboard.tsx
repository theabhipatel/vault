import { useState } from "react"
import { ArrowRight, FileText, FolderKanban, FolderPlus, Hourglass, Mail, PartyPopper, ShieldPlus, UserPlus, Users, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useSearchParams } from "react-router"

import { ActivityFeed } from "@/components/activity-feed"
import { CreateProjectDialog } from "@/components/create-dialogs"
import { DocumentRow } from "@/components/document-list"
import { InvitationsDialog } from "@/components/invitations"
import { useBreadcrumbs } from "@/components/layout/breadcrumbs"
import { useWorkspaceScope } from "@/components/layout/workspace-context"
import { Page, PageHeader, SectionTitle } from "@/components/page"
import { ProjectCard } from "@/components/project-card"
import { CardGridSkeleton, EmptyState, ErrorState, ListSkeleton } from "@/components/states"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useActivity, useMe, useMyInvitations, useProjects, useRecentDocuments, useWorkspaces } from "@/hooks/api"
import { useQuery } from "@tanstack/react-query"
import { client, unwrap } from "@/lib/api"
import { useVault } from "@/vault/vault-context"
import { Perm } from "@/lib/permissions"

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return "Working late"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function Stat({ icon: Icon, label, value, to }: { icon: LucideIcon; label: string; value: number | string; to?: string }) {
  const body = (
    <Card size="sm" className="h-full transition-colors hover:ring-brand/30">
      <CardContent className="flex items-center gap-3.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="font-heading text-2xl leading-none font-semibold tabular-nums">{value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to} className="rounded-xl">{body}</Link> : body
}

export function DashboardPage() {
  const { id, workspace, can } = useWorkspaceScope()
  const { data: me } = useMe()
  const [params, setParams] = useSearchParams()
  const projects = useProjects(id)
  const recent = useRecentDocuments(id)
  const activity = useActivity(id)
  const { data: workspaces } = useWorkspaces()
  const { data: invitations } = useMyInvitations(true)
  const [creating, setCreating] = useState(false)
  const [showInvites, setShowInvites] = useState(false)
  const vault = useVault()
  const vaultSummary = useQuery({
    queryKey: ["vault-summary"],
    queryFn: () => unwrap(client.GET("/api/vault/summary")),
    enabled: vault.status !== "loading" && vault.status !== "none",
  })
  useBreadcrumbs([{ label: workspace.name }])

  const summary = workspaces?.find((w) => w.id === id)
  const active = projects.data?.filter((p) => !p.archived_at) ?? []
  const docCount = active.reduce((n, p) => n + p.document_count, 0)
  const welcome = params.get("welcome") === "1"
  const base = `/w/${id}`
  const firstName = me?.name.split(" ")[0] ?? ""

  return (
    <Page>
      <PageHeader
        eyebrow={workspace.name}
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        description="Here's what's happening across the projects you can access."
        actions={
          <>
            {can(Perm.invite) ? (
              <Button variant="outline" asChild>
                <Link to={`${base}/members?invite=1`}>
                  <UserPlus /> Invite
                </Link>
              </Button>
            ) : null}
            {can(Perm.createProjects) ? (
              <Button onClick={() => setCreating(true)}>
                <FolderPlus /> New project
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-8 space-y-3">
        {welcome ? (
          <Alert variant="brand">
            <PartyPopper />
            <AlertTitle>{workspace.name} is ready</AlertTitle>
            <AlertDescription>
              Create your first project, then invite teammates and choose exactly what each of them can see.
            </AlertDescription>
            <AlertAction>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss"
                onClick={() => {
                  params.delete("welcome")
                  setParams(params, { replace: true })
                }}
              >
                <X />
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {vault.status === "none" ? (
          <Alert variant="secure">
            <ShieldPlus />
            <AlertTitle>Set up your vault</AlertTitle>
            <AlertDescription>
              Everything works without it, except secure documents: those stay locked until you choose a vault password.
            </AlertDescription>
            <AlertAction>
              <Button size="sm" variant="secure" onClick={vault.openSetup}>
                Set up vault
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {vaultSummary.data && vaultSummary.data.pending_projects > 0 ? (
          <Alert variant="secure">
            <Hourglass />
            <AlertTitle>
              Secure access pending in {vaultSummary.data.pending_projects} project{vaultSummary.data.pending_projects === 1 ? "" : "s"}
            </AlertTitle>
            <AlertDescription>
              A teammate who holds the key will share it with you automatically the next time their vault is unlocked.
            </AlertDescription>
          </Alert>
        ) : null}
        {invitations && invitations.length > 0 ? (
          <Alert variant="brand">
            <Mail />
            <AlertTitle>
              You have {invitations.length} pending invitation{invitations.length === 1 ? "" : "s"}
            </AlertTitle>
            <AlertDescription>
              {invitations.map((i) => i.workspace_name).join(", ")} {invitations.length === 1 ? "is" : "are"} waiting for
              your answer.
            </AlertDescription>
            <AlertAction>
              <Button size="sm" onClick={() => setShowInvites(true)}>
                Review
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
      </div>

      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={FolderKanban} label="Active projects" value={projects.isPending ? "-" : active.length} to={`${base}/projects`} />
        <Stat icon={FileText} label="Documents you can see" value={projects.isPending ? "-" : docCount} />
        <Stat icon={Users} label="Members" value={summary?.member_count ?? "-"} to={`${base}/members`} />
      </div>

      <section className="mb-10">
        <SectionTitle
          action={
            active.length > 0 ? (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`${base}/projects`}>
                  All projects <ArrowRight />
                </Link>
              </Button>
            ) : null
          }
        >
          Projects
        </SectionTitle>
        {projects.isPending ? (
          <CardGridSkeleton count={3} />
        ) : projects.error ? (
          <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
        ) : active.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={can(Perm.createProjects) ? "Create your first project" : "No projects yet"}
            description={
              can(Perm.createProjects)
                ? "Projects keep related docs and secrets together, each with its own members."
                : "You'll see projects here once someone adds you to one."
            }
            action={
              can(Perm.createProjects) ? (
                <Button onClick={() => setCreating(true)}>
                  <FolderPlus /> New project
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.slice(0, 6).map((p) => (
              <ProjectCard key={p.id} project={p} workspaceId={id} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="flex flex-col">
          <SectionTitle>Recently edited</SectionTitle>
          <Card className="flex-1 py-2">
            <CardContent className="flex flex-1 flex-col px-2">
              {recent.isPending ? (
                <ListSkeleton rows={4} className="p-2" />
              ) : recent.error ? (
                <ErrorState error={recent.error} onRetry={() => void recent.refetch()} className="border-0" />
              ) : recent.data.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No documents yet"
                  description="Documents you create or edit will appear here."
                  className="border-0 bg-transparent py-8"
                />
              ) : (
                recent.data.map((doc) => <DocumentRow key={doc.id} doc={doc} workspaceId={id} showProject />)
              )}
            </CardContent>
          </Card>
        </section>
        <section className="flex flex-col">
          <SectionTitle>Recent activity</SectionTitle>
          <Card className="flex-1 py-2">
            <CardContent className="flex flex-1 flex-col px-4">
              {activity.isPending ? (
                <ListSkeleton rows={4} />
              ) : activity.error ? (
                <ErrorState error={activity.error} onRetry={() => void activity.refetch()} className="border-0" />
              ) : (
                <ActivityFeed items={activity.data} workspaceId={id} />
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <CreateProjectDialog open={creating} onOpenChange={setCreating} workspaceId={id} />
      <InvitationsDialog open={showInvites} onOpenChange={setShowInvites} invitations={invitations ?? []} />
    </Page>
  )
}
