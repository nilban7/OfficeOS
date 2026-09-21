from fastapi import APIRouter

from app.schemas.common import ApiSuccess

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiSuccess[dict[str, str]], summary="Check API process health")
async def health() -> ApiSuccess[dict[str, str]]:
    return ApiSuccess(data={"status": "ok"})