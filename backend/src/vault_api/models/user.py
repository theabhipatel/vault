import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, LargeBinary, String, Text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from vault_api.db import Base, TimestampMixin, new_id, utcnow


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    # Always stored lower-cased and trimmed; uniqueness is enforced on this column.
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(Text)
    password_changed_at: Mapped[datetime | None]
    email_verified_at: Mapped[datetime | None]
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    theme: Mapped[str] = mapped_column(String(10), default="system", server_default="system")
    avatar: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    avatar_content_type: Mapped[str | None] = mapped_column(String(50))
    avatar_updated_at: Mapped[datetime | None]
    default_workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="SET NULL", use_alter=True)
    )
    onboarded_at: Mapped[datetime | None]


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # SHA-256 of the opaque cookie value; the raw token is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(512))


class EmailToken(Base):
    """Single-use tokens sent by email (verification, password reset)."""

    __tablename__ = "email_tokens"
    __table_args__ = (Index("ix_email_tokens_user_purpose", "user_id", "purpose"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    purpose: Mapped[str] = mapped_column(String(32))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
    # For sign-up verification: the password chosen in *that* sign-up, applied on verification.
    password_hash: Mapped[str | None] = mapped_column(Text)
