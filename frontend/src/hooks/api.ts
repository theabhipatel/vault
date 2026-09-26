import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { ApiError, client, unwrap } from "@/lib/api"
import type { Me } from "@/lib/types"

export const qk = {
  me: ["me"] as const,
  config: ["config"] as const,
  permissions: ["permissions"] as const,
  workspaces: ["workspaces"] as const,
  workspace: (id: string) => ["workspace", id] as const,
  members: (id: string) => ["workspace", id, "members"] as const,
  roles: (id: string) => ["workspace", id, "roles"] as const,
  invitations: (id: string) => ["workspace", id, "invitations"] as const,
  projects: (id: string) => ["workspace", id, "projects"] as const,
  project: (id: string, pid: string) => ["workspace", id, "project", pid] as const,
  projectMembers: (id: string, pid: string) => ["workspace", id, "project", pid, "members"] as const,
  documents: (id: string, pid: string) => ["workspace", id, "project", pid, "documents"] as const,
  document: (id: string, did: string) => ["workspace", id, "document", did] as const,
  versions: (id: string, did: string) => ["workspace", id, "document", did, "versions"] as const,
  recent: (id: string) => ["workspace", id, "recent"] as const,
  activity: (id: string) => ["workspace", id, "activity"] as const,
  audit: (id: string, filters: AuditFilters) => ["workspace", id, "audit", filters] as const,
  search: (id: string, q: string) => ["workspace", id, "search", q] as const,
  notifications: ["notifications"] as const,
  myInvitations: ["my-invitations"] as const,
  sessions: ["sessions"] as const,
  accountActivity: ["account-activity"] as const,
}

export interface AuditFilters {
  actor_id?: string
  project_id?: string
  action?: string
  date_from?: string
  date_to?: string
}

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await unwrap(client.GET("/api/auth/me"))
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 60_000,
  })
}

export function useConfig() {
  return useQuery({
    queryKey: qk.config,
    queryFn: () => unwrap(client.GET("/api/auth/config")),
    staleTime: Infinity,
  })
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: qk.permissions,
    queryFn: () => unwrap(client.GET("/api/permissions")),
    staleTime: Infinity,
  })
}

export function useWorkspaces(enabled = true) {
  return useQuery({
    queryKey: qk.workspaces,
    queryFn: () => unwrap(client.GET("/api/workspaces")),
    enabled,
  })
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: qk.workspace(id ?? ""),
    queryFn: () =>
      unwrap(client.GET("/api/workspaces/{workspace_id}", { params: { path: { workspace_id: id ?? "" } } })),
    enabled: Boolean(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
}

export function useMembers(id: string) {
  return useQuery({
    queryKey: qk.members(id),
    queryFn: () =>
      unwrap(client.GET("/api/workspaces/{workspace_id}/members", { params: { path: { workspace_id: id } } })),
  })
}

export function useRoles(id: string) {
  return useQuery({
    queryKey: qk.roles(id),
    queryFn: () =>
      unwrap(client.GET("/api/workspaces/{workspace_id}/roles", { params: { path: { workspace_id: id } } })),
  })
}

export function useInvitations(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.invitations(id),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/invitations", { params: { path: { workspace_id: id } } }),
      ),
    enabled,
  })
}

export function useProjects(id: string | undefined) {
  return useQuery({
    queryKey: qk.projects(id ?? ""),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/projects", {
          params: { path: { workspace_id: id ?? "" }, query: { include_archived: true } },
        }),
      ),
    enabled: Boolean(id),
  })
}

export function useProject(id: string, pid: string) {
  return useQuery({
    queryKey: qk.project(id, pid),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/projects/{project_id}", {
          params: { path: { workspace_id: id, project_id: pid } },
        }),
      ),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
}

export function useProjectMembers(id: string, pid: string) {
  return useQuery({
    queryKey: qk.projectMembers(id, pid),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/projects/{project_id}/members", {
          params: { path: { workspace_id: id, project_id: pid } },
        }),
      ),
  })
}

export function useDocuments(id: string, pid: string) {
  return useQuery({
    queryKey: qk.documents(id, pid),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/projects/{project_id}/documents", {
          params: { path: { workspace_id: id, project_id: pid } },
        }),
      ),
  })
}

export function useDocument(id: string, did: string) {
  return useQuery({
    queryKey: qk.document(id, did),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/documents/{document_id}", {
          params: { path: { workspace_id: id, document_id: did } },
        }),
      ),
    // Each fetch is an audited view; do not refetch silently in the background.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
}

export function useVersions(id: string, did: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.versions(id, did),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/documents/{document_id}/versions", {
          params: { path: { workspace_id: id, document_id: did } },
        }),
      ),
    enabled,
  })
}

export function useRecentDocuments(id: string) {
  return useQuery({
    queryKey: qk.recent(id),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/documents/recent", {
          params: { path: { workspace_id: id }, query: { limit: 8 } },
        }),
      ),
  })
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: qk.activity(id),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/activity", {
          params: { path: { workspace_id: id }, query: { limit: 12 } },
        }),
      ),
  })
}

export function useSearch(id: string | undefined, q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: qk.search(id ?? "", term),
    queryFn: () =>
      unwrap(
        client.GET("/api/workspaces/{workspace_id}/search", {
          params: { path: { workspace_id: id ?? "" }, query: { q: term } },
        }),
      ),
    enabled: Boolean(id) && term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => unwrap(client.GET("/api/notifications", { params: { query: { limit: 40 } } })),
    enabled,
    refetchInterval: 30_000,
  })
}

export function useMyInvitations(enabled: boolean) {
  return useQuery({
    queryKey: qk.myInvitations,
    queryFn: () => unwrap(client.GET("/api/invitations")),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useSessions() {
  return useQuery({
    queryKey: qk.sessions,
    queryFn: () => unwrap(client.GET("/api/account/sessions")),
  })
}

export function useAccountActivity() {
  return useQuery({
    queryKey: qk.accountActivity,
    queryFn: () => unwrap(client.GET("/api/account/activity")),
  })
}
