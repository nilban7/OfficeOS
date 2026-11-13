from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OsOffice API"
    app_env: str = "local"
    log_level: str = "INFO"
    database_url: str = Field(..., description="Async SQLAlchemy PostgreSQL URL")
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None
    supabase_jwt_issuer: str | None = None
    supabase_jwt_audience: str = "authenticated"
    jwt_algorithms: list[str] = ["ES256"]
    auth_required: bool = True
    supabase_anon_key: str | None = None
    documents_storage_bucket: str = "documents"
    document_download_expires_in: int = 300
    document_upload_expires_in: int = 900
    groq_api_key: str | None = None
    gemini_api_key: str | None = None

    # Gmail SMTP Email Configuration
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    email_from_name: str = "OsOffice Notifications"
    email_from_address: str | None = None
    email_enabled: bool = True
    frontend_base_url: str = Field("http://localhost:3000", validation_alias="FRONTEND_BASE_URL")

    @property
    def is_smtp_configured(self) -> bool:
        """Check whether minimum SMTP credentials are provided for live sending."""
        return bool(
            self.email_enabled
            and self.smtp_host
            and self.smtp_username
            and self.smtp_password
            and self.smtp_username.strip()
            and self.smtp_password.strip()
        )

    @property
    def sender_email(self) -> str:
        """Resolve the effective sender email address."""
        if self.email_from_address and self.email_from_address.strip():
            return self.email_from_address.strip()
        if self.smtp_username and self.smtp_username.strip():
            return self.smtp_username.strip()
        return "notifications@officeos.local" 

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
