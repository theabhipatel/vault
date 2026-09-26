import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns"

export function relativeTime(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  if (diff < 45_000) return "just now"
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (isToday(date)) return `Today, ${format(date, "HH:mm")}`
  if (isYesterday(date)) return `Yesterday, ${format(date, "HH:mm")}`
  return format(date, "d MMM yyyy")
}

export function fullDate(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm:ss")
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts
  return letters.map((p) => p.charAt(0).toUpperCase()).join("").slice(0, 2) || "?"
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** A short, readable description of a browser user agent. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device"
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /curl|python|httpx/i.test(ua) ? "API client"
    : "Browser"
  const os =
    /Windows/.test(ua) ? "Windows"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /Linux/.test(ua) ? "Linux"
    : ""
  return os ? `${browser} on ${os}` : browser
}

const ACTION_LABELS: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "auth.sign_out": "Signed out",
  "auth.sign_up": "Created account",
  "auth.email_verified": "Verified email",
  "auth.google_linked": "Linked Google account",
  "auth.password_reset_requested": "Requested password reset",
  "auth.password_reset": "Reset password",
  "auth.session_revoked": "Signed out a device",
  "auth.sessions_revoked_others": "Signed out other devices",
  "account.password_changed": "Changed password",
  "account.profile_updated": "Updated profile",
  "account.deleted": "Deleted account",
  "workspace.created": "Created workspace",
  "workspace.renamed": "Renamed workspace",
  "workspace.deleted": "Deleted workspace",
  "workspace.ownership_transferred": "Transferred ownership",
  "member.joined": "Joined workspace",
  "member.left": "Left workspace",
  "member.removed": "Removed member",
  "member.role_changed": "Changed role",
  "invitation.created": "Invited",
  "invitation.resent": "Resent invitation",
  "invitation.revoked": "Revoked invitation",
  "invitation.accepted": "Accepted invitation",
  "invitation.declined": "Declined invitation",
  "role.created": "Created role",
  "role.updated": "Updated role",
  "role.deleted": "Deleted role",
  "project.created": "Created project",
  "project.updated": "Updated project",
  "project.archived": "Archived project",
  "project.unarchived": "Restored project",
  "project.deleted": "Deleted project",
  "project.member_added": "Added to project",
  "project.member_removed": "Removed from project",
  "document.created": "Created document",
  "document.viewed": "Viewed document",
  "document.updated": "Edited document",
  "document.deleted": "Deleted document",
  "document.restored": "Restored version",
  "vault.access_revoked": "Secure access revoked",
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ")
}

export const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: "auth.", label: "Sign-in & account" },
  { value: "member.", label: "Members" },
  { value: "invitation.", label: "Invitations" },
  { value: "role.", label: "Roles & permissions" },
  { value: "workspace.", label: "Workspace" },
  { value: "project.", label: "Projects" },
  { value: "document.", label: "Documents" },
  { value: "vault.", label: "Vault & keys" },
]
