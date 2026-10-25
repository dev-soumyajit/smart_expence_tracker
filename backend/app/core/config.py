from functools import lru_cache
from pydantic import Field, SecretStr, model_validator
from email.utils import parseaddr
import re
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)
    environment: str = "development"
    database_url: str = "sqlite:///./paisa.db"
    secret_key: str = "development-only-change-before-deployment-0123456789"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14
    frontend_origins: str = "http://localhost:3000"
    groq_api_key: str = ""
    groq_model: str = ""
    ai_timeout_seconds: int = 15
    email_auth_enabled: bool = False
    resend_api_key: SecretStr = SecretStr("")
    resend_from_email: str = "Morrowmint <noreply@devsoumyajit.in>"
    email_otp_expiry_seconds: int = Field(default=600, ge=120, le=1800)
    email_otp_max_attempts: int = Field(default=5, ge=3, le=10)
    email_resend_cooldown_seconds: int = Field(default=60, ge=30, le=300)
    email_hourly_limit: int = Field(default=5, ge=1, le=30)
    email_ip_hourly_limit: int = Field(default=60, ge=5, le=1000)
    email_global_hourly_limit: int = Field(default=200, ge=5, le=5000)
    email_timeout_seconds: int = Field(default=10, ge=2, le=30)

    @model_validator(mode="after")
    def production_safety(self):
        if self.email_auth_enabled:
            if len(self.secret_key) < 40 or self.secret_key.lower().startswith(("development", "replace-", "change-", "local-only")):
                raise ValueError("Email OTPs require a random SECRET_KEY of at least 40 characters")
            address = parseaddr(self.resend_from_email)[1]
            if not self.resend_api_key.get_secret_value() or not re.fullmatch(r"[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+", address) or any(c in self.resend_from_email for c in "\r\n"):
                raise ValueError("Email authentication requires RESEND_API_KEY and a valid RESEND_FROM_EMAIL")
            if self.environment == "production" and address.lower().endswith("@resend.dev"):
                raise ValueError("Use your verified sender domain for production email")
        if self.environment == "production":
            if len(self.secret_key) < 40 or self.secret_key.lower().startswith(("development", "replace-", "change-", "local-only")):
                raise ValueError("A random SECRET_KEY of at least 40 characters is required")
            if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
                raise ValueError("Production requires PostgreSQL")
            if any(not x.strip().startswith("https://") for x in self.frontend_origins.split(",")):
                raise ValueError("Production origins must use HTTPS")
        return self


@lru_cache
def settings():
    return Settings()
