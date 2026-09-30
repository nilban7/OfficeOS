from fastapi import APIRouter

from app.api.v1.assets import router as assets_router
from app.api.v1.attendance import router as attendance_router
from app.api.v1.audit_logs import router as audit_logs_router
from app.api.v1.clients import router as clients_router
from app.api.v1.departments import router as departments_router
from app.api.v1.documents import router as documents_router
from app.api.v1.employees import router as employees_router
from app.api.v1.finance import router as finance_router
from app.api.v1.health import router as health_router
from app.api.v1.internships import router as internships_router
from app.api.v1.leave import router as leave_router
from app.api.v1.maintenance_records import router as maintenance_records_router
from app.api.v1.maintenance_requests import router as maintenance_requests_router
from app.api.v1.me import router as me_router
from app.api.v1.notifications import preferences_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.operations import router as operations_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.projects import router as projects_router
from app.api.v1.purchase_orders import router as purchase_orders_router
from app.api.v1.purchase_requests import router as purchase_requests_router
from app.api.v1.reports import router as reports_router
from app.api.v1.training_enrollments import router as training_enrollments_router
from app.api.v1.training_programs import router as training_programs_router
from app.api.v1.training_sessions import router as training_sessions_router
from app.api.v1.vendors import router as vendors_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(me_router)
router.include_router(organizations_router)
router.include_router(departments_router)
router.include_router(employees_router)
router.include_router(attendance_router)
router.include_router(leave_router)
router.include_router(clients_router)
router.include_router(projects_router)
router.include_router(purchase_requests_router)
router.include_router(purchase_orders_router)
router.include_router(vendors_router)
router.include_router(assets_router)
router.include_router(maintenance_requests_router)
router.include_router(maintenance_records_router)
router.include_router(training_programs_router)
router.include_router(training_sessions_router)
router.include_router(training_enrollments_router)
router.include_router(internships_router)
router.include_router(operations_router)
router.include_router(finance_router)
router.include_router(documents_router)
router.include_router(notifications_router)
router.include_router(preferences_router)
router.include_router(audit_logs_router)
router.include_router(reports_router)