import math
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.identity import OrganizationMembership
from app.models.notification import Notification, NotificationPreference
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.notification import (
    NotificationPreferenceItem,
    NotificationPreferenceResponse,
    NotificationResponse,
)

ALL_NOTIFICATION_TYPES = [
    "system",
    "task",
    "project",
    "document",
    "leave",
    "attendance",
    "finance",
    "maintenance",
    "training",
    "general",
]


class NotificationService:
    @staticmethod
    async def create_notification(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
        notification_type: str,
        title: str,
        message: str,
        action_url: str | None = None,
        metadata: dict[str, Any] | None = None,
        actor_id: UUID | None = None,
        ip_address: str | None = None,
    ) -> Notification | None:
        """Create a new notification for an active organization member.

        Validates recipient membership, checks user preferences, and applies audit logging.
        """
        # Validate recipient is an active member in this organization
        membership = await session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.profile_id == recipient_id,
                OrganizationMembership.status == "active",
            )
        )
        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipient is not an active member of this organization",
            )

        # Validate action_url security
        if action_url:
            clean_url = action_url.strip()
            if not clean_url.startswith("/") or clean_url.startswith("//") or "\\" in clean_url or ":" in clean_url:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="action_url must be an internal relative path starting with '/'",
                )
            action_url = clean_url

        # Check recipient preferences
        pref = await session.scalar(
            select(NotificationPreference).where(
                NotificationPreference.organization_id == organization_id,
                NotificationPreference.recipient_id == recipient_id,
                NotificationPreference.notification_type == notification_type,
            )
        )
        if pref and not pref.in_app_enabled:
            # Recipient opted out of in-app notifications for this category
            return None

        notification = Notification(
            id=uuid.uuid4(),
            organization_id=organization_id,
            recipient_id=recipient_id,
            notification_type=notification_type,
            title=title,
            message=message,
            action_url=action_url,
            metadata_json=metadata or {},
            read_at=None,
            archived_at=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(notification)

        # Audit log administrative/explicit creation if an actor is specified
        if actor_id:
            audit = AuditLog(
                id=uuid.uuid4(),
                organization_id=organization_id,
                actor_id=actor_id,
                action="notifications.create",
                entity_type="notification",
                entity_id=notification.id,
                details={
                    "recipient_id": str(recipient_id),
                    "notification_type": notification_type,
                    "title": title,
                },
                ip_address=ip_address,
                created_at=datetime.now(UTC),
            )
            session.add(audit)

        return notification

    @staticmethod
    async def list_notifications(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
        page: int = 1,
        page_size: int = 20,
        unread_only: bool = False,
        status_filter: str = "active",
        notification_type: str | None = None,
    ) -> PaginatedData[NotificationResponse]:
        """List notifications for the authenticated user in the current tenant."""
        query = select(Notification).where(
            Notification.organization_id == organization_id,
            Notification.recipient_id == recipient_id,
        )

        if unread_only or status_filter == "unread":
            query = query.where(
                Notification.read_at.is_(None),
                Notification.archived_at.is_(None),
            )
        elif status_filter == "read":
            query = query.where(
                Notification.read_at.is_not(None),
                Notification.archived_at.is_(None),
            )
        elif status_filter == "archived":
            query = query.where(Notification.archived_at.is_not(None))
        elif status_filter == "all":
            # show both active and archived
            pass
        else:
            # default: active (non-archived)
            query = query.where(Notification.archived_at.is_(None))

        if notification_type:
            query = query.where(Notification.notification_type == notification_type)

        count_query = select(func.count()).select_from(query.subquery())
        total = await session.scalar(count_query) or 0

        query = query.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        rows = (await session.scalars(query)).all()

        items = [
            NotificationResponse(
                id=r.id,
                organization_id=r.organization_id,
                recipient_id=r.recipient_id,
                notification_type=r.notification_type,
                title=r.title,
                message=r.message,
                action_url=r.action_url,
                metadata=r.metadata_json,
                read_at=r.read_at,
                archived_at=r.archived_at,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]

        total_pages = math.ceil(total / page_size) if total > 0 else 1
        return PaginatedData(
            items=items,
            meta=PaginationMeta(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ),
        )

    @staticmethod
    async def get_unread_count(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
    ) -> int:
        """Count unread non-archived notifications for the authenticated user in the current tenant."""
        count = await session.scalar(
            select(func.count(Notification.id)).where(
                Notification.organization_id == organization_id,
                Notification.recipient_id == recipient_id,
                Notification.read_at.is_(None),
                Notification.archived_at.is_(None),
            )
        )
        return count or 0

    @staticmethod
    async def get_notification(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
        notification_id: UUID,
    ) -> Notification:
        """Retrieve a specific notification owned by the authenticated user in the current tenant."""
        notification = await session.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.organization_id == organization_id,
                Notification.recipient_id == recipient_id,
            )
        )
        if notification is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found",
            )
        return notification

    @staticmethod
    async def mark_as_read(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
        notification_id: UUID,
    ) -> Notification:
        """Mark a notification as read."""
        notification = await NotificationService.get_notification(
            session, organization_id, recipient_id, notification_id
        )
        if notification.read_at is None:
            notification.read_at = datetime.now(UTC)
            notification.updated_at = datetime.now(UTC)
        return notification

    @staticmethod
    async def mark_as_unread(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
        notification_id: UUID,
    ) -> Notification:
        """Mark a notification as unread."""
        notification = await NotificationService.get_notification(
            session, organization_id, recipient_id, notification_id
        )
        notification.read_at = None
        notification.updated_at = datetime.now(UTC)
        return notification

    @staticmethod
    async def mark_all_as_read(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
    ) -> int:
        """Mark all unread notifications as read for the user in the current tenant."""
        now = datetime.now(UTC)
        stmt = (
            update(Notification)
            .where(
                Notification.organization_id == organization_id,
                Notification.recipient_id == recipient_id,
                Notification.read_at.is_(None),
                Notification.archived_at.is_(None),
            )
            .values(read_at=now, updated_at=now)
        )
        result = await session.execute(stmt)
        return result.rowcount or 0

    @staticmethod
    async def archive_notification(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
        notification_id: UUID,
    ) -> Notification:
        """Archive (soft-delete) a notification."""
        notification = await NotificationService.get_notification(
            session, organization_id, recipient_id, notification_id
        )
        if notification.archived_at is None:
            notification.archived_at = datetime.now(UTC)
            notification.updated_at = datetime.now(UTC)
        return notification

    @staticmethod
    async def get_preferences(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
    ) -> list[NotificationPreferenceResponse]:
        """Get notification preferences for the user, returning default enabled for any unconfigured type."""
        existing_prefs = (
            await session.scalars(
                select(NotificationPreference).where(
                    NotificationPreference.organization_id == organization_id,
                    NotificationPreference.recipient_id == recipient_id,
                )
            )
        ).all()
        pref_by_type = {p.notification_type: p for p in existing_prefs}

        results = []
        for ntype in ALL_NOTIFICATION_TYPES:
            if ntype in pref_by_type:
                p = pref_by_type[ntype]
                results.append(
                    NotificationPreferenceResponse(
                        id=p.id,
                        organization_id=p.organization_id,
                        recipient_id=p.recipient_id,
                        notification_type=p.notification_type,
                        in_app_enabled=p.in_app_enabled,
                        email_enabled=p.email_enabled,
                        created_at=p.created_at,
                        updated_at=p.updated_at,
                    )
                )
            else:
                now = datetime.now(UTC)
                results.append(
                    NotificationPreferenceResponse(
                        id=uuid.uuid4(),
                        organization_id=organization_id,
                        recipient_id=recipient_id,
                        notification_type=ntype,
                        in_app_enabled=True,
                        email_enabled=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
        return results

    @staticmethod
    async def update_preferences(
        session: AsyncSession,
        organization_id: UUID,
        recipient_id: UUID,
        items: list[NotificationPreferenceItem],
        actor_id: UUID | None = None,
        ip_address: str | None = None,
    ) -> list[NotificationPreferenceResponse]:
        """Update or insert notification preferences for the user."""
        for item in items:
            pref = await session.scalar(
                select(NotificationPreference).where(
                    NotificationPreference.organization_id == organization_id,
                    NotificationPreference.recipient_id == recipient_id,
                    NotificationPreference.notification_type == item.notification_type,
                )
            )
            now = datetime.now(UTC)
            if pref:
                pref.in_app_enabled = item.in_app_enabled
                pref.email_enabled = item.email_enabled
                pref.updated_at = now
            else:
                new_pref = NotificationPreference(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    recipient_id=recipient_id,
                    notification_type=item.notification_type,
                    in_app_enabled=item.in_app_enabled,
                    email_enabled=item.email_enabled,
                    created_at=now,
                    updated_at=now,
                )
                session.add(new_pref)

        if actor_id:
            audit = AuditLog(
                id=uuid.uuid4(),
                organization_id=organization_id,
                actor_id=actor_id,
                action="notifications.preferences_update",
                entity_type="notification_preference",
                entity_id=None,
                details={"updated_count": len(items)},
                ip_address=ip_address,
                created_at=datetime.now(UTC),
            )
            session.add(audit)

        return await NotificationService.get_preferences(session, organization_id, recipient_id)
