from fastapi import APIRouter

from app.api.v1.departments import router as departments_router
from app.api.v1.employees import router as employees_router
from app.api.v1.health import router as health_router
from app.api.v1.me import router as me_router
from app.api.v1.organizations import router as organizations_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(me_router)
router.include_router(organizations_router)
router.include_router(departments_router)
router.include_router(employees_router)