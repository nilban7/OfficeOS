from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.router import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.schemas.common import ApiError, ApiErrorDetail

settings = get_settings()
configure_logging(settings.log_level)
app = FastAPI(title=settings.app_name, version="0.1.0")
app.include_router(router)


def error_response(status_code: int, code: str, message: str, details: object = None) -> JSONResponse:
    body = ApiError(error=ApiErrorDetail(code=code, message=message, details=details))
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    code_by_status = {
        400: "BAD_REQUEST",
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
    }
    return error_response(exc.status_code, code_by_status.get(exc.status_code, "REQUEST_FAILED"), message)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response(422, "VALIDATION_ERROR", "Request validation failed", exc.errors())


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, __: Exception) -> JSONResponse:
    import logging

    logging.getLogger("officeos.api").exception("Unhandled API exception")
    return error_response(500, "INTERNAL_ERROR", "An internal error occurred")