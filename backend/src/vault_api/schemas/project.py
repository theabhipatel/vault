import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field, StringConstraints

from vault_api.schemas.common import APIModel, UserRef

ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
DocName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
DocKind = Literal["normal", "secure"]
DocFormat = Literal["text", "markdown", "env"]

MAX_DOCUMENT_CHARS = 1_000_000


class ProjectCreate(APIModel):
    name: ProjectName
    description: str = Field(default="", max_length=1000)


class ProjectUpdate(APIModel):
    name: ProjectName | None = None
    description: str | None = Field(default=None, max_length=1000)


class ProjectOut(APIModel):
    id: uuid.UUID
    name: str
    description: str
    created_by: UserRef | None
    created_at: datetime
    archived_at: datetime | None
    last_activity_at: datetime
    member_count: int
    document_count: int
    secure_document_count: int
    # Computed for the acting user:
    can_edit: bool
    can_manage_members: bool


class ProjectMemberOut(APIModel):
    user: UserRef
    role_name: str
    # True when the member sees the project because their role grants access to all projects.
    via_all_access: bool
    assigned: bool
    added_at: datetime | None
    can_remove: bool


class ProjectMembersAdd(APIModel):
    user_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class DocumentCreate(APIModel):
    name: DocName
    kind: DocKind
    format: DocFormat
    content: str = Field(default="", max_length=MAX_DOCUMENT_CHARS)


class DocumentUpdate(APIModel):
    expected_version: int
    name: DocName | None = None
    content: str | None = Field(default=None, max_length=MAX_DOCUMENT_CHARS)


class DocumentSummary(APIModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    name: str
    kind: DocKind
    format: DocFormat
    version: int
    created_at: datetime
    created_by: UserRef | None
    updated_at: datetime
    updated_by: UserRef | None


class DocumentOut(DocumentSummary):
    content: str | None
    can_edit: bool
    can_delete: bool


class VersionSummary(APIModel):
    version: int
    name: str
    created_at: datetime
    created_by: UserRef | None
    restored_from: int | None


class VersionOut(VersionSummary):
    content: str | None


class RestoreIn(APIModel):
    expected_version: int


class SearchResults(APIModel):
    projects: list[ProjectOut]
    documents: list[DocumentSummary]


class ActivityOut(APIModel):
    id: int
    created_at: datetime
    action: str
    actor_id: uuid.UUID | None
    actor_name: str | None
    actor_email: str | None
    target_type: str | None
    target_id: str | None
    target_label: str | None
    project_id: uuid.UUID | None
    project_name: str | None
    result: str
    ip: str | None
    user_agent: str | None
    details: dict[str, Any]


class NotificationOut(APIModel):
    id: uuid.UUID
    type: str
    title: str
    body: str
    link: str | None
    workspace_id: uuid.UUID | None
    data: dict[str, Any]
    created_at: datetime
    read_at: datetime | None


class NotificationList(APIModel):
    items: list[NotificationOut]
    unread_count: int
