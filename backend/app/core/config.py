from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OfficeOS API"
    app_env: str = "local"
    log_level: str = "INFO"
    database_url: str = Field(..., description="Async SQLAlchemy PostgreSQL URL")
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None
    supabase_jwt_issuer: str | None = None
    supabase_jwt_audience: str = "authenticated"
    jwt_algorithms: list[str] = ["ES256"]
    auth_required: bool = True

    @model_validator(mode="after")
    def set_derived_supabase_fields(self) -> "Settings":
        if self.supabase_url:
            normalized_url = str(self.supabase_url).rstrip("/")
            if not self.supabase_jwt_issuer:
                self.supabase_jwt_issuer = f"{normalized_url}/auth/v1"
            if not self.supabase_jwks_url:
                self.supabase_jwks_url = f"{normalized_url}/auth/v1/.well-known/jwks.json"
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()