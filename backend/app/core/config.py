from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "development"
    database_url: str = "sqlite:///./paisa.db"
    secret_key: str = "development-only-change-before-deployment-0123456789"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14
    frontend_origins: str = "http://localhost:3000"
    groq_api_key: str = ""
    groq_model: str = ""
    ai_timeout_seconds: int = 15

    @model_validator(mode="after")
    def production_safety(self):
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
