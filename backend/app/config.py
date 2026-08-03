"""Application settings loaded from environment."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
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

    # Agent / LLM — disabled by default; never commit real keys
    ai_enabled: bool = Field(default=False, alias="AI_ENABLED")
    llm_provider: str = Field(default="fake", alias="LLM_PROVIDER")
    llm_model: str = Field(default="gpt-4.1-mini", alias="LLM_MODEL")
    llm_api_key: str | None = Field(default=None, alias="LLM_API_KEY")
    llm_api_base: str = Field(
        default="https://api.openai.com/v1",
        alias="LLM_API_BASE",
    )
    llm_timeout_seconds: float = Field(default=30.0, alias="LLM_TIMEOUT_SECONDS")
    llm_max_tool_steps: int = Field(default=4, alias="LLM_MAX_TOOL_STEPS")
    llm_max_input_chars: int = Field(default=4000, alias="LLM_MAX_INPUT_CHARS")
    ai_rate_limit_per_hour: int = Field(default=60, alias="AI_RATE_LIMIT_PER_HOUR")
    ai_pending_action_ttl_minutes: int = Field(default=15, alias="AI_PENDING_ACTION_TTL_MINUTES")
    llm_input_token_cost_per_1k: float = Field(default=0.0, alias="LLM_INPUT_TOKEN_COST_PER_1K")
    llm_output_token_cost_per_1k: float = Field(default=0.0, alias="LLM_OUTPUT_TOKEN_COST_PER_1K")

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
