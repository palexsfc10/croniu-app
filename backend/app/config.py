"""Application settings loaded from environment."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    croniu_env: str = Field(default="development", alias="CRONIU_ENV")
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")
    database_url: str = Field(
        default="postgresql+psycopg://croniu:croniu_dev_password_change_me@localhost:5433/croniu",
        alias="DATABASE_URL",
    )
    secret_key: str = Field(
        default="dev-only-change-me-to-a-long-random-string-at-least-32-chars",
        alias="SECRET_KEY",
    )
    session_cookie_name: str = Field(default="croniu_session", alias="SESSION_COOKIE_NAME")
    session_ttl_hours: int = Field(default=168, alias="SESSION_TTL_HOURS")
    session_cookie_secure: bool = Field(default=False, alias="SESSION_COOKIE_SECURE")
    session_cookie_samesite: str = Field(default="lax", alias="SESSION_COOKIE_SAMESITE")
    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")
    openapi_enabled: bool = Field(default=True, alias="OPENAPI_ENABLED")
    admin_session_cookie_name: str = Field(
        default="croniu_admin_session", alias="ADMIN_SESSION_COOKIE_NAME"
    )
    admin_session_ttl_hours: int = Field(default=8, alias="ADMIN_SESSION_TTL_HOURS")
    platform_list_max_limit: int = Field(default=50, alias="PLATFORM_LIST_MAX_LIMIT")
    platform_search_min_chars: int = Field(default=2, alias="PLATFORM_SEARCH_MIN_CHARS")
    public_app_base_url: str = Field(
        default="http://localhost:3000",
        alias="PUBLIC_APP_BASE_URL",
    )
    proof_storage_dir: str = Field(
        default="var/proofs",
        alias="PROOF_STORAGE_DIR",
    )
    public_rate_limit_per_minute: int = Field(default=60, alias="PUBLIC_RATE_LIMIT_PER_MINUTE")
    max_proof_bytes: int = Field(default=5_242_880, alias="MAX_PROOF_BYTES")

    @field_validator("secret_key")
    @classmethod
    def secret_key_min_length(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production_like(self) -> bool:
        return self.croniu_env.lower() in {"production", "hml", "staging"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
