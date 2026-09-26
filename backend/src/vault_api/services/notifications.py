import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vault_api.models import Membership, Notification, Role
from vault_api.permissions import Perm


def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type: str,
    title: str,
    body: str = "",
    link: str | None = None,
    workspace_id: uuid.UUID | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    db.add(
        Notification(
            user_id=user_id,
            type=type,
            title=title[:200],
            body=body[:1000],
            link=link,
            workspace_id=workspace_id,
            data=data or {},
        )
    )


async def workspace_admin_ids(db: AsyncSession, workspace_id: uuid.UUID) -> list[uuid.UUID]:
    """The owner plus everyone whose role can manage members (admins by default)."""
    rows = await db.execute(
        select(Membership.user_id, Membership.is_owner, Role.permissions)
        .join(Role, Role.id == Membership.role_id)
        .where(Membership.workspace_id == workspace_id)
    )
    return [
        r.user_id
        for r in rows
        if r.is_owner or Perm.MEMBERS_CHANGE_ROLE.value in (r.permissions or [])
    ]
