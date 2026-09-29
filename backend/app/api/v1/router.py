from fastapi import APIRouter

from app.api.v1.attendance import router as attendance_router
from app.api.v1.clients import router as clients_router
from app.api.v1.departments import router as departments_router
from app.api.v1.employees import router as employees_router
from app.api.v1.health import router as health_router
from app.api.v1.leave import router as leave_router
from app.api.v1.me import router as me_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.projects import router as projects_router

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