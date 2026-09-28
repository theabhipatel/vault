import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from vault_api.schemas.common import APIModel, EmailIn, WorkspaceName

RoleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class WorkspaceCreate(APIModel):
    name: WorkspaceName


class WorkspaceUpdate(APIModel):
    name: WorkspaceName


class ConfirmName(APIModel):
    confirm_name: str = Field(max_length=200)


class WorkspaceSummary(APIModel):
    id: uuid.UUID
    name: str
    is_owner: bool
    is_default: bool
    role_name: str
    owner_name: str
    member_count: int


class RoleOut(APIModel):
    id: uuid.UUID
    name: str
    description: str
    rank: int
    system_key: str | None
    permissions: list[str]
    member_count: int
    # Computed for the acting user:
    can_edit: bool
    can_delete: bool
    can_assign: bool


class WorkspaceDetail(APIModel):
    id: uuid.UUID
    name: str
    owner_id: uuid.UUID
    created_at: datetime
    is_owner: bool
    is_default: bool
    role: RoleOut
    permissions: list[str]


class ProjectRef(APIModel):
    id: uuid.UUID
    name: str


VaultStatus = Literal["not_set_up", "ready", "pending"]


class MemberOut(APIModel):
    user_id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None
    role_id: uuid.UUID
    role_name: str
    role_rank: int
    is_owner: bool
    joined_at: datetime
    all_projects: bool
    projects: list[ProjectRef]
    vault_status: VaultStatus
    # The fingerprint is computed from this in the browser, never trusted from the server.
    public_key: str | None
    can_manage: bool


class MemberRoleUpdate(APIModel):
    role_id: uuid.UUID


class MemberProjectsUpdate(APIModel):
    project_ids: list[uuid.UUID] = Field(max_length=500)


class TransferOwnership(APIModel):
    user_id: uuid.UUID
    confirm_name: str = Field(max_length=200)


class InvitationCreate(EmailIn):
    role_id: uuid.UUID
    project_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)


class InvitationOut(APIModel):
    id: uuid.UUID
    email: str
    role_id: uuid.UUID
    role_name: str
    projects: list[ProjectRef]
    invited_by_name: str | None
    status: str
    expired: bool
    created_at: datetime
    last_sent_at: datetime
    expires_at: datetime


class MyInvitation(APIModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    workspace_name: str
    role_name: str
    invited_by_name: str | None
    created_at: datetime
    expires_at: datetime


class AcceptedInvitation(APIModel):
    workspace_id: uuid.UUID


class PermissionInfo(APIModel):
    key: str
    group: str
    label: str
    description: str


class RoleCreate(APIModel):
    name: RoleName
    description: str = Field(default="", max_length=300)
    permissions: list[str] = Field(max_length=64)
    place_below_role_id: uuid.UUID


class RoleUpdate(APIModel):
    name: RoleName | None = None
    description: str | None = Field(default=None, max_length=300)
    permissions: list[str] | None = Field(default=None, max_length=64)
    place_below_role_id: uuid.UUID | None = None


class RoleDelete(APIModel):
    replacement_role_id: uuid.UUID | None = None
