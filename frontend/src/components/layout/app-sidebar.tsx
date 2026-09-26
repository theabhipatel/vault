import { useState } from "react"
import {
  Archive,
  Folder,
  FolderKanban,
  LayoutDashboard,
  Lock,
  Plus,
  ScrollText,
  Settings,
  ShieldHalf,
  UserPlus,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router"

import { CreateProjectDialog } from "@/components/create-dialogs"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useProjects, useWorkspace } from "@/hooks/api"
import { Perm, can } from "@/lib/permissions"

import { WorkspaceSwitcher } from "./workspace-switcher"

interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  exact?: boolean
  visible: boolean
}

const MAX_SIDEBAR_PROJECTS = 8

export function AppSidebar({ workspaceId }: { workspaceId: string | null }) {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const { data: workspace } = useWorkspace(workspaceId ?? undefined)
  const { data: projects, isPending: projectsPending } = useProjects(workspaceId ?? undefined)
  const [creatingProject, setCreatingProject] = useState(false)

  const perms = workspace?.permissions
  const base = workspaceId ? `/w/${workspaceId}` : null
  const nav: NavItem[] = base
    ? [
        { label: "Dashboard", icon: LayoutDashboard, to: base, exact: true, visible: true },
        { label: "Projects", icon: FolderKanban, to: `${base}/projects`, visible: true },
        { label: "Members", icon: Users, to: `${base}/members`, visible: true },
        {
          label: "Roles",
          icon: ShieldHalf,
          to: `${base}/roles`,
          visible: can(perms, Perm.manageRoles) || can(perms, Perm.changeRoles),
        },
        { label: "Audit log", icon: ScrollText, to: `${base}/audit`, visible: can(perms, Perm.viewAudit) },
        { label: "Settings", icon: Settings, to: `${base}/settings`, visible: true },
      ]
    : []

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)

  const active = projects?.filter((p) => !p.archived_at) ?? []
  const archivedCount = (projects?.length ?? 0) - active.length
  const close = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="pt-3">
        <WorkspaceSwitcher currentId={workspaceId} />
      </SidebarHeader>
      <SidebarContent>
        {base ? (
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav
                  .filter((item) => item.visible)
                  .map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                        <Link to={item.to} onClick={close}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {base ? (
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            {can(perms, Perm.createProjects) ? (
              <SidebarGroupAction title="New project" onClick={() => setCreatingProject(true)}>
                <Plus /> <span className="sr-only">New project</span>
              </SidebarGroupAction>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {projectsPending
                  ? [0, 1, 2].map((i) => (
                      <SidebarMenuItem key={i}>
                        <SidebarMenuSkeleton showIcon />
                      </SidebarMenuItem>
                    ))
                  : null}
                {active.slice(0, MAX_SIDEBAR_PROJECTS).map((project) => {
                  const to = `${base}/projects/${project.id}`
                  return (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton asChild isActive={pathname.startsWith(to)} tooltip={project.name}>
                        <Link to={to} onClick={close}>
                          <Folder />
                          <span>{project.name}</span>
                        </Link>
                      </SidebarMenuButton>
                      {project.secure_document_count > 0 ? (
                        <SidebarMenuBadge className="text-secure" aria-label={`${project.secure_document_count} secure documents`}>
                          <Lock className="size-3" />
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
                {!projectsPending && active.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-1.5 text-xs group-data-[collapsible=icon]:hidden">No projects yet.</p>
                ) : null}
                {active.length > MAX_SIDEBAR_PROJECTS || archivedCount > 0 ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="text-muted-foreground" tooltip="All projects">
                      <Link to={`${base}/projects`} onClick={close}>
                        <Archive />
                        <span>All projects{archivedCount > 0 ? ` · ${archivedCount} archived` : ""}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      {base && can(perms, Perm.invite) ? (
        <SidebarFooter className="group-data-[collapsible=icon]:hidden">
          <div className="rounded-xl border bg-card p-3.5 shadow-xs">
            <p className="text-sm font-semibold">Bring your team</p>
            <p className="text-muted-foreground mt-0.5 mb-3 text-xs leading-relaxed">
              Invite teammates and choose exactly what they can see.
            </p>
            <Button size="sm" variant="outline" className="w-full" asChild>
              <Link to={`${base}/members?invite=1`} onClick={close}>
                <UserPlus /> Invite people
              </Link>
            </Button>
          </div>
        </SidebarFooter>
      ) : null}
      <SidebarRail />
      {workspaceId ? (
        <CreateProjectDialog open={creatingProject} onOpenChange={setCreatingProject} workspaceId={workspaceId} />
      ) : null}
    </Sidebar>
  )
}
