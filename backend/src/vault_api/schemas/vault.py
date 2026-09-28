"""Vault payloads. Every binary value is standard base64 and is size-checked here. The server
never interprets these bytes; it only stores and relays them."""

import base64
import binascii
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from vault_api.schemas.common import APIModel
from vault_api.schemas.project import DocName

MIB = 1024 * 1024
MAX_CIPHERTEXT_B64 = 1_500_000  # ~1 MB of plaintext plus GCM overhead, base64 encoded


def _b64(exact: int | None = None, maximum: int | None = None) -> AfterValidator:
    def check(value: str) -> str:
        try:
            raw = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("must be base64") from exc
        if exact is not None and len(raw) != exact:
            raise ValueError(f"must decode to {exact} bytes")
        if maximum is not None and len(raw) > maximum:
            raise ValueError("is too large")
        return value

    return AfterValidator(check)


PublicKey = Annotated[str, Field(max_length=64), _b64(exact=32)]
Salt = Annotated[str, Field(max_length=64), _b64(exact=16)]
Nonce = Annotated[str, Field(max_length=32), _b64(exact=12)]
# X25519 secret key (32 bytes) + 16-byte GCM tag.
EncryptedPrivateKey = Annotated[str, Field(max_length=128), _b64(exact=48)]
SealedKey = Annotated[str, Field(max_length=1024), _b64(maximum=512)]
Ciphertext = Annotated[str, Field(max_length=MAX_CIPHERTEXT_B64), _b64()]


class KdfParams(APIModel):
    algorithm: Literal["argon2id13"]
    salt: Salt
    # Requirement floor: at least 3 iterations and 64 MiB.
    ops: int = Field(ge=3, le=20)
    mem: int = Field(ge=64 * MIB, le=1024 * MIB)


class VaultKeysIn(APIModel):
    public_key: PublicKey
    kdf: KdfParams
    encrypted_private_key: EncryptedPrivateKey
    private_key_nonce: Nonce
    recovery_encrypted_private_key: EncryptedPrivateKey
    recovery_nonce: Nonce


class VaultResetIn(VaultKeysIn):
    confirm: Literal["RESET"]


class VaultPasswordIn(APIModel):
    """Re-encrypt the same private key under a new password-derived key."""

    public_key: PublicKey
    kdf: KdfParams
    encrypted_private_key: EncryptedPrivateKey
    private_key_nonce: Nonce


class VaultRecoveryIn(APIModel):
    public_key: PublicKey
    recovery_encrypted_private_key: EncryptedPrivateKey
    recovery_nonce: Nonce


class VaultRecoverIn(VaultPasswordIn):
    recovery_encrypted_private_key: EncryptedPrivateKey
    recovery_nonce: Nonce


class VaultOut(APIModel):
    user_id: uuid.UUID
    public_key: str
    kdf: KdfParams
    encrypted_private_key: str
    private_key_nonce: str
    recovery_encrypted_private_key: str
    recovery_nonce: str
    key_epoch: int
    created_at: datetime
    updated_at: datetime


class VaultSummary(APIModel):
    has_vault: bool
    public_key: str | None
    pending_projects: int


class ResetImpact(APIModel):
    workspace_id: uuid.UUID
    workspace_name: str
    project_id: uuid.UUID
    project_name: str
    secure_document_count: int
    sole_holder: bool


class GrantIn(APIModel):
    user_id: uuid.UUID
    public_key: PublicKey
    sealed_key: SealedKey


class Recipient(APIModel):
    user_id: uuid.UUID
    name: str
    email: str
    public_key: str


MyState = Literal["no_permission", "no_vault", "uninitialized", "pending", "ready", "lost"]


class ProjectVaultState(APIModel):
    project_id: uuid.UUID
    workspace_id: uuid.UUID
    key_version: int | None
    rotation_pending: bool
    holders: int
    my_state: MyState
    my_sealed_key: str | None
    # Everyone who should hold the current key and has a vault (sealing targets).
    recipients: list[Recipient]
    # Recipients who don't hold the current key yet.
    missing: list[uuid.UUID]


class InitKeyIn(APIModel):
    grants: list[GrantIn] = Field(min_length=1, max_length=1000)


class GrantKeysIn(APIModel):
    key_version: int
    grants: list[GrantIn] = Field(min_length=1, max_length=1000)


class RotationItem(APIModel):
    document_id: uuid.UUID
    version: int
    format: str
    ciphertext: str
    nonce: str
    key_version: int


class RotationMaterial(APIModel):
    key_version: int
    items: list[RotationItem]


class RotatedItem(APIModel):
    document_id: uuid.UUID
    version: int
    ciphertext: Ciphertext
    nonce: Nonce


class RotateIn(APIModel):
    from_version: int
    grants: list[GrantIn] = Field(min_length=1, max_length=1000)
    items: list[RotatedItem] = Field(max_length=100_000)


class PendingWork(APIModel):
    workspace_id: uuid.UUID
    workspace_name: str
    project_id: uuid.UUID
    project_name: str
    key_version: int
    rotation_pending: bool
    recipients: list[Recipient]


class SecureDocumentCreate(APIModel):
    # Generated in the browser so the ciphertext can be bound to the document id (AAD).
    id: uuid.UUID
    name: DocName
    format: Literal["text", "markdown", "env"]
    key_version: int
    ciphertext: Ciphertext
    nonce: Nonce


class SecureDocumentUpdate(APIModel):
    expected_version: int
    name: DocName | None = None
    key_version: int
    ciphertext: Ciphertext
    nonce: Nonce
    restored_from: int | None = None
