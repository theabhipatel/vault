import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from vault_api.db import Base, TimestampMixin, new_id, utcnow


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )


class Role(TimestampMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_roles_workspace_name"),
        UniqueConstraint(
            "workspace_id",
            "rank",
            name="uq_roles_workspace_rank",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(String(300), default="", server_default="")
    # Higher rank = more powerful. The owner role is always the highest.
    rank: Mapped[int] = mapped_column(Integer)
    # "owner" | "admin" | "manager" | "member" for built-in roles, NULL for custom roles.
    system_key: Mapped[str | None] = mapped_column(String(20))
    permissions: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_memberships_workspace_user"),
        # Exactly one owner per workspace, enforced by the database.
        Index(
            "uq_memberships_one_owner",
            "workspace_id",
            unique=True,
            postgresql_where=text("is_owner"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # NO ACTION (checked at statement end) so deleting a workspace can cascade to both tables,
    # while deleting a role that is still in use is refused.
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id"), index=True
    )
    is_owner: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    joined_at: Mapped[datetime] = mapped_column(default=utcnow)


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (
        Index(
            "uq_invitations_pending_email",
            "workspace_id",
            "email",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_invitations_email_status", "email", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320))
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE")
    )
    project_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # pending | accepted | declined | revoked
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_sent_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]
    responded_at: Mapped[datetime | None]
