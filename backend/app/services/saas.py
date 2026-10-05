import math
import time
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import distinct, func, not_, or_, select, text
from sqlalchemy.exc import DBAPIError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import AuthenticatedUser
from app.models.asset import Asset
from app.models.audit import AuditLog
from app.models.client import Client
from app.models.document import Document
from app.models.employee import Employee
from app.models.identity import (
    Branch,
    MembershipRole,
    Organization,
    OrganizationMembership,
    OrganizationSetting,
    Profile,
    Role,
)
from app.models.project import Project
from app.models.saas import PlatformAnnouncement, PlatformConfiguration
from app.schemas.audit import (
    ActorSummary,
    AuditLogDetail,
    AuditLogResponse,
    sanitize_sensitive_data,
)
from app.schemas.common import PaginatedData, PaginationMeta
from app.schemas.saas import (
    OrganizationDetailResponse,
    OrganizationDirectoryItem,
    OrganizationDirectoryResponse,
    PlatformAnnouncementCreate,
    PlatformAnnouncementResponse,
    PlatformAnnouncementUpdate,
    PlatformConfigurationResponse,
    PlatformConfigurationUpdate,
    PlatformHealthResponse,
    PlatformMemberItem,
    PlatformMembersResponse,
    PlatformOverviewResponse,
    PlatformUsageResponse,
)
from app.services.audit import AuditLogService
from app.services.identity import get_profile


TEST_ORG_FILTERS = (
    not_(Organization.name.ilike("Org %")),
    not_(Organization.slug.ilike("org-%")),
    not_(Organization.slug.ilike("ai-org-%")),
    not_(Organization.slug.ilike("saas-org-%")),
)


class SaaSAdminService:
    @staticmethod
    async def get_overview(session: AsyncSession) -> PlatformOverviewResponse:
        total_orgs = (await session.scalar(select(func.count(Organization.id)).where(*TEST_ORG_FILTERS))) or 0
        active_orgs = (
            await session.scalar(
                select(func.count(Organization.id)).where(Organization.status == "active", *TEST_ORG_FILTERS)
            )
        ) or 0
        suspended_orgs = (
            await session.scalar(
                select(func.count(Organization.id)).where(Organization.status == "suspended", *TEST_ORG_FILTERS)
            )
        ) or 0
        total_users = (await session.scalar(select(func.count(distinct(Profile.id))))) or 0
        total_employees = (await session.scalar(select(func.count(distinct(Employee.id))))) or 0

        # Recent 5 organizations
        recent_orgs_query = (
            select(Organization).where(*TEST_ORG_FILTERS).order_by(Organization.created_at.desc()).limit(5)
        )
        recent_orgs = list(await session.scalars(recent_orgs_query))

        items: list[OrganizationDirectoryItem] = []
        for org in recent_orgs:
            b_count = (
                await session.scalar(
                    select(func.count(Branch.id)).where(Branch.organization_id == org.id)
                )
            ) or 0
            m_count = (
                await session.scalar(
                    select(func.count(OrganizationMembership.id)).where(
                        OrganizationMembership.organization_id == org.id,
                        OrganizationMembership.status == "active",
                    )
                )
            ) or 0
            e_count = (
                await session.scalar(
                    select(func.count(Employee.id)).where(Employee.organization_id == org.id)
                )
            ) or 0

            items.append(
                OrganizationDirectoryItem(
                    id=org.id,
                    name=org.name,
                    slug=org.slug,
                    status=getattr(org, "status", "active"),
                    is_active=org.is_active,
                    created_at=org.created_at,
                    updated_at=org.updated_at,
                    branch_count=b_count,
                    member_count=m_count,
                    employee_count=e_count,
                    suspension_reason=org.suspension_reason,
                    suspended_at=org.suspended_at,
                )
            )

        return PlatformOverviewResponse(
            total_organizations=total_orgs,
            active_organizations=active_orgs,
            suspended_organizations=suspended_orgs,
            total_users=total_users,
            total_employees=total_employees,
            recent_organizations=items,
            system_status="healthy",
        )

    @staticmethod
    async def list_organizations(
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        status_filter: str | None = None,
    ) -> OrganizationDirectoryResponse:
        query = select(Organization).where(*TEST_ORG_FILTERS)
        count_query = select(func.count(Organization.id)).where(*TEST_ORG_FILTERS)

        filters = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(or_(Organization.name.ilike(term), Organization.slug.ilike(term)))
        if status_filter and status_filter.strip():
            filters.append(Organization.status == status_filter.strip())

        if filters:
            query = query.where(*filters)
            count_query = count_query.where(*filters)

        total = (await session.scalar(count_query)) or 0
        total_pages = math.ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        orgs = list(await session.scalars(query.order_by(Organization.created_at.desc()).offset(offset).limit(page_size)))

        items: list[OrganizationDirectoryItem] = []
        for org in orgs:
            b_count = (
                await session.scalar(
                    select(func.count(Branch.id)).where(Branch.organization_id == org.id)
                )
            ) or 0
            m_count = (
                await session.scalar(
                    select(func.count(OrganizationMembership.id)).where(
                        OrganizationMembership.organization_id == org.id,
                        OrganizationMembership.status == "active",
                    )
                )
            ) or 0
            e_count = (
                await session.scalar(
                    select(func.count(Employee.id)).where(Employee.organization_id == org.id)
                )
            ) or 0

            items.append(
                OrganizationDirectoryItem(
                    id=org.id,
                    name=org.name,
                    slug=org.slug,
                    status=getattr(org, "status", "active"),
                    is_active=org.is_active,
                    created_at=org.created_at,
                    updated_at=org.updated_at,
                    branch_count=b_count,
                    member_count=m_count,
                    employee_count=e_count,
                    suspension_reason=org.suspension_reason,
                    suspended_at=org.suspended_at,
                )
            )

        return OrganizationDirectoryResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    @staticmethod
    async def get_organization_detail(session: AsyncSession, org_id: UUID) -> OrganizationDetailResponse:
        org = await session.scalar(select(Organization).where(Organization.id == org_id))
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

        settings = await session.scalar(
            select(OrganizationSetting).where(OrganizationSetting.organization_id == org_id)
        )
        b_count = (await session.scalar(select(func.count(Branch.id)).where(Branch.organization_id == org_id))) or 0
        m_count = (
            await session.scalar(
                select(func.count(OrganizationMembership.id)).where(
                    OrganizationMembership.organization_id == org_id,
                    OrganizationMembership.status == "active",
                )
            )
        ) or 0
        e_count = (await session.scalar(select(func.count(Employee.id)).where(Employee.organization_id == org_id))) or 0
        p_count = (await session.scalar(select(func.count(Project.id)).where(Project.organization_id == org_id))) or 0

        return OrganizationDetailResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            status=getattr(org, "status", "active"),
            is_active=org.is_active,
            created_at=org.created_at,
            updated_at=org.updated_at,
            suspension_reason=org.suspension_reason,
            suspended_at=org.suspended_at,
            timezone=settings.timezone if settings else "UTC",
            currency=settings.currency if settings else "USD",
            branch_count=b_count,
            member_count=m_count,
            employee_count=e_count,
            project_count=p_count,
        )

    @staticmethod
    async def suspend_organization(
        session: AsyncSession,
        org_id: UUID,
        reason: str | None,
        actor_id: UUID | None,
        ip_address: str | None,
    ) -> OrganizationDetailResponse:
        org = await session.scalar(select(Organization).where(Organization.id == org_id))
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

        org.status = "suspended"
        org.is_active = False
        org.suspension_reason = reason
        org.suspended_at = datetime.now(UTC)
        session.add(org)

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=org.id,
            actor_id=actor_id,
            action="organization.suspended",
            entity_type="organization",
            entity_id=org.id,
            details={"reason": reason},
            ip_address=ip_address,
        )
        await session.commit()
        await session.refresh(org)
        return await SaaSAdminService.get_organization_detail(session, org_id)

    @staticmethod
    async def activate_organization(
        session: AsyncSession,
        org_id: UUID,
        actor_id: UUID | None,
        ip_address: str | None,
    ) -> OrganizationDetailResponse:
        org = await session.scalar(select(Organization).where(Organization.id == org_id))
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

        org.status = "active"
        org.is_active = True
        org.suspension_reason = None
        org.suspended_at = None
        session.add(org)

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=org.id,
            actor_id=actor_id,
            action="organization.activated",
            entity_type="organization",
            entity_id=org.id,
            details={},
            ip_address=ip_address,
        )
        await session.commit()
        await session.refresh(org)
        return await SaaSAdminService.get_organization_detail(session, org_id)

    @staticmethod
    async def restore_organization(
        session: AsyncSession,
        org_id: UUID,
        actor_id: UUID | None,
        ip_address: str | None,
    ) -> OrganizationDetailResponse:
        org = await session.scalar(select(Organization).where(Organization.id == org_id))
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

        org.status = "active"
        org.is_active = True
        org.suspension_reason = None
        org.suspended_at = None
        session.add(org)

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=org.id,
            actor_id=actor_id,
            action="organization.restored",
            entity_type="organization",
            entity_id=org.id,
            details={},
            ip_address=ip_address,
        )
        await session.commit()
        await session.refresh(org)
        return await SaaSAdminService.get_organization_detail(session, org_id)

    @staticmethod
    async def create_organization(
        session: AsyncSession,
        name: str,
        slug: str | None,
        timezone: str = "UTC",
        currency: str = "USD",
        actor_id: UUID | None = None,
        ip_address: str | None = None,
    ) -> OrganizationDetailResponse:
        import re

        clean_slug = slug or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        existing = await session.scalar(select(Organization).where(Organization.slug == clean_slug))
        if existing:
            clean_slug = f"{clean_slug}-{uuid.uuid4().hex[:6]}"

        new_org = Organization(
            id=uuid.uuid4(),
            name=name.strip(),
            slug=clean_slug,
            is_active=True,
            status="active",
        )
        session.add(new_org)

        # Settings
        new_settings = OrganizationSetting(
            id=uuid.uuid4(),
            organization_id=new_org.id,
            timezone=timezone,
            currency=currency,
        )
        session.add(new_settings)

        # Default HQ Branch
        hq_branch = Branch(
            id=uuid.uuid4(),
            organization_id=new_org.id,
            name="Headquarters",
            code="HQ",
            is_active=True,
        )
        session.add(hq_branch)

        # If actor exists, add them as organization owner
        if actor_id:
            membership = OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=new_org.id,
                profile_id=actor_id,
                status="active",
            )
            session.add(membership)

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=new_org.id,
            actor_id=actor_id,
            action="organization.created",
            entity_type="organization",
            entity_id=new_org.id,
            details={"name": name, "slug": clean_slug},
            ip_address=ip_address,
        )
        await session.commit()
        await session.refresh(new_org)
        return await SaaSAdminService.get_organization_detail(session, new_org.id)

    @staticmethod
    async def update_organization(
        session: AsyncSession,
        org_id: UUID,
        name: str | None = None,
        slug: str | None = None,
        is_active: bool | None = None,
        actor_id: UUID | None = None,
        ip_address: str | None = None,
    ) -> OrganizationDetailResponse:
        org = await session.scalar(select(Organization).where(Organization.id == org_id))
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

        changes: dict[str, Any] = {}
        if name and name.strip():
            changes["name"] = name.strip()
            org.name = name.strip()
        if slug and slug.strip():
            clean_slug = slug.strip().lower()
            existing = await session.scalar(
                select(Organization).where(Organization.slug == clean_slug, Organization.id != org_id)
            )
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Organization slug already exists")
            changes["slug"] = clean_slug
            org.slug = clean_slug
        if is_active is not None:
            changes["is_active"] = is_active
            org.is_active = is_active
            if is_active:
                org.status = "active"
                org.suspension_reason = None
                org.suspended_at = None
            else:
                org.status = "suspended"
                org.suspended_at = datetime.now(UTC)

        session.add(org)
        await AuditLogService.record_audit_log(
            session=session,
            organization_id=org.id,
            actor_id=actor_id,
            action="organization.updated",
            entity_type="organization",
            entity_id=org.id,
            details=changes,
            ip_address=ip_address,
        )
        await session.commit()
        await session.refresh(org)
        return await SaaSAdminService.get_organization_detail(session, org_id)

    @staticmethod
    async def delete_organization(
        session: AsyncSession,
        org_id: UUID,
        actor_id: UUID | None = None,
        ip_address: str | None = None,
    ) -> None:
        org = await session.scalar(select(Organization).where(Organization.id == org_id))
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

        # Soft delete / suspend with decommission notice
        org.status = "suspended"
        org.is_active = False
        org.suspension_reason = "Decommissioned by platform administrator"
        org.suspended_at = datetime.now(UTC)
        session.add(org)

        await AuditLogService.record_audit_log(
            session=session,
            organization_id=org.id,
            actor_id=actor_id,
            action="organization.deleted",
            entity_type="organization",
            entity_id=org.id,
            details={"name": org.name, "slug": org.slug},
            ip_address=ip_address,
        )
        await session.commit()


    @staticmethod
    async def list_members(
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        org_id: UUID | None = None,
    ) -> PlatformMembersResponse:
        query = (
            select(OrganizationMembership, Profile, Organization)
            .join(Profile, Profile.id == OrganizationMembership.profile_id)
            .join(Organization, Organization.id == OrganizationMembership.organization_id)
        )
        count_query = (
            select(func.count(OrganizationMembership.id))
            .join(Profile, Profile.id == OrganizationMembership.profile_id)
            .join(Organization, Organization.id == OrganizationMembership.organization_id)
        )

        filters = []
        if org_id:
            filters.append(OrganizationMembership.organization_id == org_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    Profile.email.ilike(term),
                    Profile.first_name.ilike(term),
                    Profile.last_name.ilike(term),
                    Organization.name.ilike(term),
                )
            )

        if filters:
            query = query.where(*filters)
            count_query = count_query.where(*filters)

        total = (await session.scalar(count_query)) or 0
        total_pages = math.ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        rows = (
            await session.execute(
                query.order_by(OrganizationMembership.created_at.desc()).offset(offset).limit(page_size)
            )
        ).all()

        items: list[PlatformMemberItem] = []
        for membership, profile, org in rows:
            role_names = list(
                await session.scalars(
                    select(Role.name)
                    .join(MembershipRole, MembershipRole.role_id == Role.id)
                    .where(MembershipRole.membership_id == membership.id)
                )
            )
            items.append(
                PlatformMemberItem(
                    membership_id=membership.id,
                    profile_id=profile.id,
                    auth_user_id=profile.auth_user_id,
                    email=profile.email,
                    first_name=profile.first_name,
                    last_name=profile.last_name,
                    organization_id=org.id,
                    organization_name=org.name,
                    status=membership.status,
                    roles=role_names,
                    created_at=membership.created_at,
                )
            )

        return PlatformMembersResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    @staticmethod
    async def get_usage_metrics(session: AsyncSession) -> PlatformUsageResponse:
        total_orgs = (await session.scalar(select(func.count(Organization.id)))) or 0
        active_orgs = (
            await session.scalar(select(func.count(Organization.id)).where(Organization.status == "active"))
        ) or 0
        suspended_orgs = (
            await session.scalar(select(func.count(Organization.id)).where(Organization.status == "suspended"))
        ) or 0
        total_members = (
            await session.scalar(
                select(func.count(OrganizationMembership.id)).where(OrganizationMembership.status == "active")
            )
        ) or 0
        total_employees = (await session.scalar(select(func.count(distinct(Employee.id))))) or 0
        total_projects = (await session.scalar(select(func.count(Project.id)))) or 0
        total_clients = (await session.scalar(select(func.count(Client.id)))) or 0
        total_assets = (await session.scalar(select(func.count(Asset.id)))) or 0
        total_documents = (await session.scalar(select(func.count(Document.id)))) or 0

        # Top organizations breakdown
        top_orgs = list(await session.scalars(select(Organization).order_by(Organization.created_at.desc()).limit(10)))
        breakdown: list[dict[str, Any]] = []
        for org in top_orgs:
            m_count = (
                await session.scalar(
                    select(func.count(OrganizationMembership.id)).where(
                        OrganizationMembership.organization_id == org.id,
                        OrganizationMembership.status == "active",
                    )
                )
            ) or 0
            e_count = (
                await session.scalar(
                    select(func.count(Employee.id)).where(Employee.organization_id == org.id)
                )
            ) or 0
            p_count = (
                await session.scalar(
                    select(func.count(Project.id)).where(Project.organization_id == org.id)
                )
            ) or 0
            breakdown.append(
                {
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                    "status": getattr(org, "status", "active"),
                    "members": m_count,
                    "employees": e_count,
                    "projects": p_count,
                }
            )

        return PlatformUsageResponse(
            total_organizations=total_orgs,
            active_organizations=active_orgs,
            suspended_organizations=suspended_orgs,
            total_members=total_members,
            total_employees=total_employees,
            total_projects=total_projects,
            total_clients=total_clients,
            total_assets=total_assets,
            total_documents=total_documents,
            organization_breakdown=breakdown,
        )

    @staticmethod
    async def get_platform_health(session: AsyncSession) -> PlatformHealthResponse:
        start_time = time.perf_counter()
        await session.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Get Alembic migration head
        migration_version = "0020_saas_administration_module"
        try:
            res = await session.scalar(text("SELECT version_num FROM alembic_version LIMIT 1"))
            if res:
                migration_version = str(res)
        except (SQLAlchemyError, DBAPIError) as exc:
            import logging
            logging.getLogger(__name__).debug("Alembic version query: %s", exc)

        active_orgs = (
            await session.scalar(select(func.count(Organization.id)).where(Organization.status == "active"))
        ) or 0

        return PlatformHealthResponse(
            status="healthy",
            database_connected=True,
            database_latency_ms=latency_ms,
            migration_head=migration_version,
            app_version="1.0.0",
            environment="production",
            active_organizations=active_orgs,
        )

    @staticmethod
    async def list_audit_logs(
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        org_id: UUID | None = None,
        action: str | None = None,
        actor_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        actor_user: AuthenticatedUser | None = None,
        ip_address: str | None = None,
    ) -> AuditLogResponse:
        query = select(AuditLog).options(selectinload(AuditLog.actor))
        count_query = select(func.count(AuditLog.id))

        filters = []
        if org_id:
            filters.append(AuditLog.organization_id == org_id)
        if action and action.strip():
            filters.append(AuditLog.action.ilike(f"%{action.strip()}%"))
        if actor_id:
            filters.append(AuditLog.actor_id == actor_id)
        if date_from:
            filters.append(AuditLog.created_at >= date_from)
        if date_to:
            filters.append(AuditLog.created_at <= date_to)

        if filters:
            query = query.where(*filters)
            count_query = count_query.where(*filters)

        total = (await session.scalar(count_query)) or 0
        total_pages = math.ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        logs = list(await session.scalars(query.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)))

        items: list[AuditLogDetail] = []
        for log in logs:
            actor_summary = None
            if log.actor:
                actor_summary = ActorSummary(
                    id=log.actor.id,
                    email=log.actor.email,
                    first_name=log.actor.first_name,
                    last_name=log.actor.last_name,
                )
            items.append(
                AuditLogDetail(
                    id=log.id,
                    organization_id=log.organization_id,
                    actor_id=log.actor_id,
                    action=log.action,
                    entity_type=log.entity_type,
                    entity_id=log.entity_id,
                    details=sanitize_sensitive_data(log.details) if log.details else {},
                    ip_address=log.ip_address,
                    created_at=log.created_at,
                    actor=actor_summary,
                )
            )

        # Audit the platform audit inspection itself if caller provided
        if actor_user and logs:
            first_org_id = logs[0].organization_id
            actor_prof = await get_profile(session, actor_user)
            await AuditLogService.record_audit_log(
                session=session,
                organization_id=first_org_id,
                actor_id=actor_prof.id if actor_prof else None,
                action="saas.audit_logs.view",
                entity_type="platform_audit",
                entity_id=None,
                details={"page": page, "page_size": page_size, "filter_org": str(org_id) if org_id else None},
                ip_address=ip_address,
            )
            await session.commit()

        return AuditLogResponse(
            data=PaginatedData[AuditLogDetail](
                items=items,
                meta=PaginationMeta(
                    page=page,
                    page_size=page_size,
                    total=total,
                    total_pages=total_pages,
                ),
            )
        )

    @staticmethod
    async def get_platform_config(session: AsyncSession) -> PlatformConfigurationResponse:
        cfg = await session.scalar(select(PlatformConfiguration).limit(1))
        if not cfg:
            # Create default if missing
            cfg = PlatformConfiguration(
                id=uuid.uuid4(),
                platform_name="OfficeOS",
                support_email="support@officeos.internal",
                maintenance_mode=False,
                allowed_signup_domains=[],
                max_organizations=1000,
            )
            session.add(cfg)
            await session.commit()
            await session.refresh(cfg)
        return PlatformConfigurationResponse.model_validate(cfg)

    @staticmethod
    async def update_platform_config(
        session: AsyncSession,
        data: PlatformConfigurationUpdate,
        actor_id: UUID | None,
        ip_address: str | None,
    ) -> PlatformConfigurationResponse:
        cfg = await session.scalar(select(PlatformConfiguration).limit(1))
        if not cfg:
            cfg = PlatformConfiguration(id=uuid.uuid4())
            session.add(cfg)

        update_dict = data.model_dump(exclude_unset=True)
        for k, v in update_dict.items():
            setattr(cfg, k, v)

        # Audit log
        first_org = await session.scalar(select(Organization.id).limit(1))
        if first_org:
            await AuditLogService.record_audit_log(
                session=session,
                organization_id=first_org,
                actor_id=actor_id,
                action="saas.config.updated",
                entity_type="platform_configuration",
                entity_id=cfg.id,
                details=update_dict,
                ip_address=ip_address,
            )

        await session.commit()
        await session.refresh(cfg)
        return PlatformConfigurationResponse.model_validate(cfg)

    @staticmethod
    async def list_announcements(
        session: AsyncSession,
        is_active_only: bool = False,
    ) -> list[PlatformAnnouncementResponse]:
        query = select(PlatformAnnouncement).order_by(PlatformAnnouncement.starts_at.desc())
        if is_active_only:
            query = query.where(
                PlatformAnnouncement.is_active == True,
                PlatformAnnouncement.starts_at <= datetime.now(UTC),
                or_(
                    PlatformAnnouncement.ends_at.is_(None),
                    PlatformAnnouncement.ends_at > datetime.now(UTC),
                ),
            )
        announcements = list(await session.scalars(query))
        return [PlatformAnnouncementResponse.model_validate(a) for a in announcements]

    @staticmethod
    async def create_announcement(
        session: AsyncSession,
        data: PlatformAnnouncementCreate,
        creator_profile_id: UUID | None,
        actor_id: UUID | None,
        ip_address: str | None,
    ) -> PlatformAnnouncementResponse:
        announcement = PlatformAnnouncement(
            id=uuid.uuid4(),
            title=data.title,
            content=data.content,
            severity=data.severity,
            is_active=data.is_active,
            target_type=data.target_type,
            target_org_ids=data.target_org_ids,
            created_by_id=creator_profile_id,
            starts_at=data.starts_at or datetime.now(UTC),
            ends_at=data.ends_at,
        )
        session.add(announcement)

        first_org = await session.scalar(select(Organization.id).limit(1))
        if first_org:
            await AuditLogService.record_audit_log(
                session=session,
                organization_id=first_org,
                actor_id=actor_id,
                action="saas.announcement.created",
                entity_type="platform_announcement",
                entity_id=announcement.id,
                details={"title": data.title, "severity": data.severity, "target_type": data.target_type},
                ip_address=ip_address,
            )

        await session.commit()
        await session.refresh(announcement)
        return PlatformAnnouncementResponse.model_validate(announcement)

    @staticmethod
    async def update_announcement(
        session: AsyncSession,
        announcement_id: UUID,
        data: PlatformAnnouncementUpdate,
        actor_id: UUID | None,
        ip_address: str | None,
    ) -> PlatformAnnouncementResponse:
        announcement = await session.scalar(
            select(PlatformAnnouncement).where(PlatformAnnouncement.id == announcement_id)
        )
        if not announcement:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")

        update_dict = data.model_dump(exclude_unset=True)
        for k, v in update_dict.items():
            setattr(announcement, k, v)

        first_org = await session.scalar(select(Organization.id).limit(1))
        if first_org:
            await AuditLogService.record_audit_log(
                session=session,
                organization_id=first_org,
                actor_id=actor_id,
                action="saas.announcement.updated",
                entity_type="platform_announcement",
                entity_id=announcement.id,
                details=update_dict,
                ip_address=ip_address,
            )

        await session.commit()
        await session.refresh(announcement)
        return PlatformAnnouncementResponse.model_validate(announcement)

    @staticmethod
    async def delete_announcement(
        session: AsyncSession,
        announcement_id: UUID,
        actor_id: UUID | None,
        ip_address: str | None,
    ) -> None:
        announcement = await session.scalar(
            select(PlatformAnnouncement).where(PlatformAnnouncement.id == announcement_id)
        )
        if not announcement:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")

        first_org = await session.scalar(select(Organization.id).limit(1))
        if first_org:
            await AuditLogService.record_audit_log(
                session=session,
                organization_id=first_org,
                actor_id=actor_id,
                action="saas.announcement.deleted",
                entity_type="platform_announcement",
                entity_id=announcement.id,
                details={"title": announcement.title},
                ip_address=ip_address,
            )

        await session.delete(announcement)
        await session.commit()
