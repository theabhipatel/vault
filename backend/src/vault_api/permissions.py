"""Permission catalogue, default roles and the pure hierarchy rules.

Everything in this module is side-effect free so the rules can be unit tested directly.
"""

from dataclasses import dataclass
from enum import StrEnum


class Perm(StrEnum):
    WORKSPACE_SETTINGS = "workspace.manage_settings"
    MEMBERS_INVITE = "members.invite"
    MEMBERS_REMOVE = "members.remove"
    MEMBERS_CHANGE_ROLE = "members.change_role"
    ROLES_MANAGE = "roles.manage"
    AUDIT_VIEW = "audit.view"
    PROJECTS_ACCESS_ALL = "projects.access_all"
    PROJECTS_CREATE = "projects.create"
    PROJECTS_EDIT = "projects.edit"
    PROJECTS_MANAGE_MEMBERS = "projects.manage_members"
    DOCS_VIEW = "docs.view"
    DOCS_EDIT = "docs.edit"
    DOCS_DELETE = "docs.delete"
    SECURE_VIEW = "secure.view"
    SECURE_EDIT = "secure.edit"
    SECURE_DELETE = "secure.delete"


ALL_PERMS: frozenset[Perm] = frozenset(Perm)


@dataclass(frozen=True)
class PermInfo:
    key: Perm
    group: str
    label: str
    description: str


PERMISSION_CATALOG: tuple[PermInfo, ...] = (
    PermInfo(
        Perm.WORKSPACE_SETTINGS,
        "Workspace",
        "Manage workspace settings",
        "Rename the workspace and change its settings.",
    ),
    PermInfo(
        Perm.MEMBERS_INVITE,
        "Workspace",
        "Invite members",
        "Invite people by email with a role ranked below their own.",
    ),
    PermInfo(
        Perm.MEMBERS_REMOVE,
        "Workspace",
        "Remove members",
        "Remove members whose role ranks below their own.",
    ),
    PermInfo(
        Perm.MEMBERS_CHANGE_ROLE,
        "Workspace",
        "Change member roles",
        "Change the role of members ranked below them.",
    ),
    PermInfo(
        Perm.ROLES_MANAGE,
        "Workspace",
        "Manage roles",
        "Create, edit and delete roles ranked below their own.",
    ),
    PermInfo(
        Perm.AUDIT_VIEW, "Workspace", "View audit log", "See and export the workspace audit log."
    ),
    PermInfo(
        Perm.PROJECTS_ACCESS_ALL,
        "Projects",
        "Access all projects",
        "See every project, not only assigned ones.",
    ),
    PermInfo(Perm.PROJECTS_CREATE, "Projects", "Create projects", "Create new projects."),
    PermInfo(
        Perm.PROJECTS_EDIT,
        "Projects",
        "Edit, archive and delete projects",
        "Applies to projects they can access.",
    ),
    PermInfo(
        Perm.PROJECTS_MANAGE_MEMBERS,
        "Projects",
        "Manage project members",
        "Assign people to projects they can access.",
    ),
    PermInfo(Perm.DOCS_VIEW, "Normal documents", "View", "Read normal documents."),
    PermInfo(
        Perm.DOCS_EDIT, "Normal documents", "Create and edit", "Create and edit normal documents."
    ),
    PermInfo(Perm.DOCS_DELETE, "Normal documents", "Delete", "Delete normal documents."),
    PermInfo(
        Perm.SECURE_VIEW,
        "Secure documents",
        "View",
        "Decrypt and read secure documents. Grants a copy of the project key.",
    ),
    PermInfo(
        Perm.SECURE_EDIT, "Secure documents", "Create and edit", "Create and edit secure documents."
    ),
    PermInfo(Perm.SECURE_DELETE, "Secure documents", "Delete", "Delete secure documents."),
)

OWNER_RANK = 1000
MAX_ASSIGNABLE_RANK = OWNER_RANK - 1
MIN_RANK = 1


@dataclass(frozen=True)
class DefaultRole:
    system_key: str
    name: str
    description: str
    rank: int
    permissions: frozenset[Perm]


DEFAULT_ROLES: tuple[DefaultRole, ...] = (
    DefaultRole(
        "owner",
        "Owner",
        "Full control of the workspace. Exactly one per workspace.",
        OWNER_RANK,
        ALL_PERMS,
    ),
    DefaultRole(
        "admin",
        "Admin",
        "Manages everything and everyone except the owner and admins.",
        900,
        ALL_PERMS,
    ),
    DefaultRole(
        "manager",
        "Manager",
        "Runs the projects they are assigned to.",
        500,
        frozenset(
            {
                Perm.MEMBERS_INVITE,
                Perm.PROJECTS_CREATE,
                Perm.PROJECTS_EDIT,
                Perm.PROJECTS_MANAGE_MEMBERS,
                Perm.DOCS_VIEW,
                Perm.DOCS_EDIT,
                Perm.DOCS_DELETE,
                Perm.SECURE_VIEW,
                Perm.SECURE_EDIT,
                Perm.SECURE_DELETE,
            }
        ),
    ),
    DefaultRole(
        "member",
        "Member",
        "Works on documents in their assigned projects.",
        100,
        frozenset({Perm.DOCS_VIEW, Perm.DOCS_EDIT, Perm.SECURE_VIEW, Perm.SECURE_EDIT}),
    ),
)


class PermissionDenied(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class Actor:
    """The acting member's standing within one workspace."""

    rank: int
    permissions: frozenset[str]
    is_owner: bool

    def has(self, perm: Perm) -> bool:
        return self.is_owner or perm.value in self.permissions


def parse_permissions(values: list[str] | set[str] | frozenset[str]) -> frozenset[str]:
    valid = {p.value for p in Perm}
    unknown = set(values) - valid
    if unknown:
        raise PermissionDenied(f"Unknown permissions: {', '.join(sorted(unknown))}")
    return frozenset(values)


def require(actor: Actor, perm: Perm) -> None:
    if not actor.has(perm):
        raise PermissionDenied("You do not have permission to do that.")


def can_manage_rank(actor: Actor, target_rank: int) -> bool:
    """A user can only manage users (and roles) ranked strictly below their own."""
    return actor.is_owner or target_rank < actor.rank


def check_manage_member(actor: Actor, target_rank: int, target_is_owner: bool) -> None:
    if target_is_owner:
        raise PermissionDenied("The workspace owner cannot be managed.")
    if not can_manage_rank(actor, target_rank):
        raise PermissionDenied("You can only manage members whose role ranks below yours.")


def check_assignable_role(
    actor: Actor, role_rank: int, role_permissions: frozenset[str], role_is_owner: bool
) -> None:
    """Whether `actor` may give someone (existing member or invitee) this role."""
    if role_is_owner:
        raise PermissionDenied("Ownership can only be transferred, not assigned.")
    if not can_manage_rank(actor, role_rank):
        raise PermissionDenied("You can only assign roles ranked below your own.")
    if not actor.is_owner and not role_permissions <= actor.permissions:
        raise PermissionDenied("You can only assign roles whose permissions you hold yourself.")


def check_role_edit(
    actor: Actor,
    role_rank: int,
    role_is_owner: bool,
    old_permissions: frozenset[str],
    new_permissions: frozenset[str],
) -> None:
    require(actor, Perm.ROLES_MANAGE)
    if role_is_owner:
        raise PermissionDenied("The Owner role cannot be edited.")
    if not can_manage_rank(actor, role_rank):
        raise PermissionDenied("You can only edit roles ranked below your own.")
    changed = old_permissions ^ new_permissions
    if not actor.is_owner and not changed <= actor.permissions:
        raise PermissionDenied("You can only grant or remove permissions you hold yourself.")


def check_role_rank_target(actor: Actor, new_rank: int) -> None:
    if not MIN_RANK <= new_rank <= MAX_ASSIGNABLE_RANK:
        raise PermissionDenied("That position is not available.")
    if not can_manage_rank(actor, new_rank):
        raise PermissionDenied("You can only place roles below your own.")
