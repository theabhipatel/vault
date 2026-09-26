"""Integration points between access control and the end-to-end encrypted vault.

Access-control code calls these whenever someone's secure-document access to a project changes.
The vault key tables (sealed project keys, pending grants, rotation state) are introduced with the
vault itself; until a project has a project key there is nothing to seal or rotate, so these only
keep the audit trail.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from vault_api.models import User
from vault_api.services import audit
from vault_api.services.audit import RequestMeta


async def revoke_secure_access(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_ids: set[uuid.UUID],
    *,
    actor: User,
    meta: RequestMeta | None,
) -> None:
    for user_id in user_ids:
        audit.record(
            db,
            action="vault.access_revoked",
            actor=actor,
            meta=meta,
            workspace_id=workspace_id,
            project_id=project_id,
            target_type="user",
            target_id=user_id,
        )


async def queue_secure_grants(
    db: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID, user_ids: set[uuid.UUID]
) -> None:
    return None
