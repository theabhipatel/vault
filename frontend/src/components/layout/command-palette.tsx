import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  Bell,
  Folder,
  FolderKanban,
  FolderPlus,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  ScrollText,
  Settings,
  ShieldHalf,
  Sun,
  UserRound,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useNavigate } from "react-router"

import { CreateProjectDialog } from "@/components/create-dialogs"
import { DocIcon } from "@/components/doc-badges"
import { SignOutDialog } from "@/components/sign-out-dialog"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"
import { useProjects, useSearch, useWorkspace } from "@/hooks/api"
import { useSetTheme } from "@/hooks/session"
import { Perm, can } from "@/lib/permissions"

interface PaletteState {
  open: () => void
}

const PaletteContext = createContext<PaletteState | null>(null)

export function useCommandPalette(): PaletteState {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error("useCommandPalette must be used inside CommandPaletteProvider")
  return ctx
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return debounced
}

interface StaticItem {
  id: string
  label: string
  icon: LucideIcon
  run: () => void
  keywords?: string
  visible?: boolean
}

function matches(item: { label: string; keywords?: string }, q: string): boolean {
  if (!q) return true
  return `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(q.toLowerCase())
}

export function CommandPaletteProvider({ workspaceId, children }: { workspaceId: string | null; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creatingProject, setCreatingProject] = useState(false)
  const navigate = useNavigate()
  const setTheme = useSetTheme()
  const [signingOut, setSigningOut] = useState(false)
  const { data: workspace } = useWorkspace(workspaceId ?? undefined)
  const { data: projects } = useProjects(workspaceId ?? undefined)
  const debounced = useDebounced(query, 200)
  const search = useSearch(workspaceId ?? undefined, debounced)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const run = (fn: () => void) => {
    setOpen(false)
    setQuery("")
    fn()
  }

  const base = workspaceId ? `/w/${workspaceId}` : null
  const perms = workspace?.permissions
  const navItems: StaticItem[] = [
    ...(base
      ? [
          { id: "dash", label: "Dashboard", icon: LayoutDashboard, run: () => navigate(base) },
          { id: "projects", label: "Projects", icon: FolderKanban, run: () => navigate(`${base}/projects`) },
          { id: "members", label: "Members", icon: Users, keywords: "people team invite", run: () => navigate(`${base}/members`) },
          {
            id: "roles",
            label: "Roles & permissions",
            icon: ShieldHalf,
            run: () => navigate(`${base}/roles`),
            visible: can(perms, Perm.manageRoles) || can(perms, Perm.changeRoles),
          },
          { id: "audit", label: "Audit log", icon: ScrollText, run: () => navigate(`${base}/audit`), visible: can(perms, Perm.viewAudit) },
          { id: "ws-settings", label: "Workspace settings", icon: Settings, run: () => navigate(`${base}/settings`) },
        ]
      : []),
    { id: "profile", label: "Account settings", icon: UserRound, keywords: "profile password sessions", run: () => navigate("/settings/profile") },
    { id: "notifications", label: "Notifications", icon: Bell, run: () => navigate("/notifications") },
  ]
  const actionItems: StaticItem[] = [
    {
      id: "new-project",
      label: "New project",
      icon: FolderPlus,
      run: () => setCreatingProject(true),
      visible: Boolean(base) && can(perms, Perm.createProjects),
    },
    { id: "light", label: "Switch to light theme", icon: Sun, keywords: "appearance", run: () => setTheme("light") },
    { id: "dark", label: "Switch to dark theme", icon: Moon, keywords: "appearance", run: () => setTheme("dark") },
    { id: "system", label: "Use system theme", icon: Monitor, keywords: "appearance", run: () => setTheme("system") },
    { id: "signout", label: "Sign out", icon: LogOut, run: () => setSigningOut(true) },
  ]

  const visibleNav = navItems.filter((i) => i.visible !== false && matches(i, query))
  const visibleActions = actionItems.filter((i) => i.visible !== false && matches(i, query))
  const localProjects = (projects ?? []).filter((p) => matches({ label: p.name }, query)).slice(0, query ? 8 : 5)
  const documents = query.trim() ? (search.data?.documents ?? []) : []
  const nothing = visibleNav.length + visibleActions.length + localProjects.length + documents.length === 0

  const ctx = useMemo(() => ({ open: () => setOpen(true) }), [])

  return (
    <PaletteContext.Provider value={ctx}>
      {children}
      <CommandDialog
        open={isOpen}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setQuery("")
        }}
        title="Search and commands"
        description="Search projects and documents by name, or jump anywhere."
      >
        <Command shouldFilter={false} loop>
        <CommandInput placeholder="Search projects, documents, or type a command…" value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[min(60vh,28rem)]">
          {nothing && !search.isFetching ? <CommandEmpty>No results for “{query}”.</CommandEmpty> : null}
          {documents.length > 0 || (search.isFetching && query.trim()) ? (
            <CommandGroup heading="Documents">
              {search.isFetching && documents.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm">
                  <Spinner /> Searching…
                </div>
              ) : null}
              {documents.map((doc) => (
                <CommandItem
                  key={doc.id}
                  value={`doc-${doc.id}`}
                  onSelect={() => run(() => navigate(`${base}/projects/${doc.project_id}/docs/${doc.id}`))}
                >
                  <DocIcon kind={doc.kind} format={doc.format} className="size-6 rounded-md" />
                  <span className="truncate">{doc.name}</span>
                  <span className="text-muted-foreground ml-auto truncate text-xs">{doc.project_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {localProjects.length > 0 ? (
            <CommandGroup heading="Projects">
              {localProjects.map((p) => (
                <CommandItem key={p.id} value={`project-${p.id}`} onSelect={() => run(() => navigate(`${base}/projects/${p.id}`))}>
                  <Folder />
                  <span className="truncate">{p.name}</span>
                  {p.archived_at ? <span className="text-muted-foreground ml-auto text-xs">Archived</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {visibleNav.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Go to">
                {visibleNav.map((item) => (
                  <CommandItem key={item.id} value={`nav-${item.id}`} onSelect={() => run(item.run)}>
                    <item.icon /> {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
          {visibleActions.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                {visibleActions.map((item) => (
                  <CommandItem key={item.id} value={`action-${item.id}`} onSelect={() => run(item.run)}>
                    <item.icon /> {item.label}
                    {item.id === "new-project" ? <CommandShortcut>New</CommandShortcut> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
        </Command>
      </CommandDialog>
      {workspaceId ? (
        <CreateProjectDialog open={creatingProject} onOpenChange={setCreatingProject} workspaceId={workspaceId} />
      ) : null}
      <SignOutDialog open={signingOut} onOpenChange={setSigningOut} />
    </PaletteContext.Provider>
  )
}
