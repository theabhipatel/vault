"""End-to-end encryption storage. The server only ever holds public keys, ciphertext and
key material sealed or encrypted in the browser. None of it can be decrypted server-side."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from vault_api.db import Base, TimestampMixin, utcnow


class UserVault(TimestampMixin, Base):
    """A keypair: public key in the clear, private key encrypted twice (password, recovery)."""

    __tablename__ = "user_vaults"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    public_key: Mapped[str] = mapped_column(String(64))
    # Argon2id parameters are stored per user so they can be raised later.
    kdf_algorithm: Mapped[str] = mapped_column(String(20))
    kdf_salt: Mapped[str] = mapped_column(String(64))
    kdf_ops: Mapped[int] = mapped_column(Integer)
    kdf_mem: Mapped[int] = mapped_column(Integer)
    encrypted_private_key: Mapped[str] = mapped_column(String(128))
    private_key_nonce: Mapped[str] = mapped_column(String(32))
    recovery_encrypted_private_key: Mapped[str] = mapped_column(String(128))
    recovery_nonce: Mapped[str] = mapped_column(String(32))
    # Incremented on every vault reset (new keypair).
    key_epoch: Mapped[int] = mapped_column(Integer, default=1)


class ProjectKeyGrant(Base):
    """One copy of a project key, sealed (libsodium sealed box) to one user's public key."""

    __tablename__ = "project_key_grants"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    key_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    sealed_key: Mapped[str] = mapped_column(Text)
    # The public key it was sealed to; a vault reset makes older grants useless.
    recipient_public_key: Mapped[str] = mapped_column(String(64))
    granted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
