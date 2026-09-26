import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from vault_api.db import Base, new_id, utcnow


class AuditLog(Base):
    """Append-only audit trail. A database trigger rejects UPDATE and DELETE.

    `workspace_id` and `actor_id` are intentionally not foreign keys: entries must
    survive deletion of the workspace or user they describe.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_workspace_created", "workspace_id", "created_at"),
        Index("ix_audit_logs_actor_created", "actor_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    actor_email: Mapped[str | None] = mapped_column(String(320))
    actor_name: Mapped[str | None] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(64))
    target_label: Mapped[str | None] = mapped_column(String(320))
    result: Mapped[str] = mapped_column(String(16), default="success")
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(512))
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE")
    )
    type: Mapped[str] = mapped_column(String(48))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(1000), default="")
    link: Mapped[str | None] = mapped_column(String(500))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    read_at: Mapped[datetime | None]


class EmailOutbox(Base):
    """Transactional outbox: emails are committed with the business change and sent by a worker."""

    __tablename__ = "email_outbox"
    __table_args__ = (Index("ix_email_outbox_pending", "status", "next_attempt_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    to_address: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300))
    text_body: Mapped[str] = mapped_column(Text)
    html_body: Mapped[str] = mapped_column(Text)
    # pending | sent | failed
    status: Mapped[str] = mapped_column(String(16), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_error: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    sent_at: Mapped[datetime | None]


class RateLimit(Base):
    """Fixed-window counters shared by every API instance."""

    __tablename__ = "rate_limits"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    window_start: Mapped[datetime]
    count: Mapped[int] = mapped_column(Integer, default=0)
