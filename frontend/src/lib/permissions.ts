/** Permission keys, mirroring the server's catalogue. The server enforces every check; the
 * client only uses these to hide actions a user cannot perform. */
export const Perm = {
  workspaceSettings: "workspace.manage_settings",
  invite: "members.invite",
  removeMembers: "members.remove",
  changeRoles: "members.change_role",
  manageRoles: "roles.manage",
  viewAudit: "audit.view",
  accessAllProjects: "projects.access_all",
  createProjects: "projects.create",
  editProjects: "projects.edit",
  manageProjectMembers: "projects.manage_members",
  viewDocs: "docs.view",
  editDocs: "docs.edit",
  deleteDocs: "docs.delete",
  viewSecure: "secure.view",
  editSecure: "secure.edit",
  deleteSecure: "secure.delete",
} as const

export type PermKey = (typeof Perm)[keyof typeof Perm]

export function can(permissions: readonly string[] | undefined, perm: PermKey): boolean {
  return permissions?.includes(perm) ?? false
}
