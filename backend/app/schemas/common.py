from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiSuccess(BaseModel, Generic[T]):
    success: bool = True
    data: T
    message: str | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    details: Any | None = None
    field: str | None = None


class ApiError(BaseModel):
    success: bool = False
    error: ApiErrorDetail
    timestamp: datetime = Field(default_factory=datetime.utcnow)