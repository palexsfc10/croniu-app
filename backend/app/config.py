"""Application settings loaded from environment."""

from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    croniu_env: str = Field(default="development", alias="CRONIU_ENV")
    app_version: str = Field(default="0.0.0-dev", alias="APP_VERSION")
    git_sha: str = Field(default="unknown", alias="GIT_SHA")
    build_time: str = Field(default="", alias="BUILD_TIME")
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
    # Public URLs for transactional e-mail links (Resend). Prefer APP_PUBLIC_URL.
    app_public_url: str = Field(default="", alias="APP_PUBLIC_URL")
    api_public_url: str = Field(default="", alias="API_PUBLIC_URL")
    admin_public_url: str = Field(default="", alias="ADMIN_PUBLIC_URL")
    email_provider: str = Field(default="fake", alias="EMAIL_PROVIDER")
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    email_from: str = Field(
        default="Croniu <no-reply@send.croniu.com.br>",
        alias="EMAIL_FROM",
    )
    email_reply_to: str = Field(default="", alias="EMAIL_REPLY_TO")
    email_timeout_seconds: float = Field(default=10.0, alias="EMAIL_TIMEOUT_SECONDS")
    email_verification_required: bool = Field(
        default=False,
        alias="EMAIL_VERIFICATION_REQUIRED",
    )
    auth_rate_limit_per_minute: int = Field(default=10, alias="AUTH_RATE_LIMIT_PER_MINUTE")
    trust_proxy: bool = Field(default=False, alias="TRUST_PROXY")
    trusted_proxy_ips: str = Field(
        default="127.0.0.1,::1",
        alias="TRUSTED_PROXY_IPS",
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
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-5.6-terra", alias="OPENAI_MODEL")
    llm_api_base: str = Field(
        default="https://api.openai.com/v1",
        alias="LLM_API_BASE",
    )
    llm_timeout_seconds: float = Field(default=30.0, alias="LLM_TIMEOUT_SECONDS")
    llm_max_tool_steps: int = Field(
        default=6,
        validation_alias=AliasChoices(
            "llm_max_tool_steps", "AI_MAX_TOOL_ROUNDS", "LLM_MAX_TOOL_STEPS"
        ),
    )
    llm_max_input_chars: int = Field(default=4000, alias="LLM_MAX_INPUT_CHARS")
    ai_rate_limit_per_hour: int = Field(default=60, alias="AI_RATE_LIMIT_PER_HOUR")
    ai_pending_action_ttl_minutes: int = Field(default=15, alias="AI_PENDING_ACTION_TTL_MINUTES")
    ai_confirmation_ttl_seconds: int = Field(default=600, alias="AI_CONFIRMATION_TTL_SECONDS")
    ai_store_responses: bool = Field(default=False, alias="AI_STORE_RESPONSES")
    ai_user_requests_per_minute: int = Field(default=6, alias="AI_USER_REQUESTS_PER_MINUTE")
    ai_org_daily_request_limit: int = Field(default=200, alias="AI_ORG_DAILY_REQUEST_LIMIT")
    ai_org_monthly_token_limit: int | None = Field(
        default=None, alias="AI_ORG_MONTHLY_TOKEN_LIMIT"
    )
    llm_input_token_cost_per_1k: float = Field(default=0.0, alias="LLM_INPUT_TOKEN_COST_PER_1K")
    llm_output_token_cost_per_1k: float = Field(default=0.0, alias="LLM_OUTPUT_TOKEN_COST_PER_1K")

    # Voice transcription (STT) — off by default; never store raw audio permanently
    voice_enabled: bool = Field(default=False, alias="VOICE_ENABLED")
    openai_transcription_model: str = Field(
        default="whisper-1",
        alias="OPENAI_TRANSCRIPTION_MODEL",
    )
    voice_max_seconds: int = Field(default=60, alias="VOICE_MAX_SECONDS")
    voice_max_bytes: int = Field(default=4_194_304, alias="VOICE_MAX_BYTES")  # 4 MiB
    voice_allowed_mime_types: str = Field(
        default=(
            "audio/webm,audio/webm;codecs=opus,audio/mp4,audio/mpeg,audio/wav,"
            "audio/x-wav,audio/ogg,audio/ogg;codecs=opus,video/webm"
        ),
        alias="VOICE_ALLOWED_MIME_TYPES",
    )
    voice_timeout_seconds: float = Field(default=45.0, alias="VOICE_TIMEOUT_SECONDS")
    voice_user_requests_per_minute: int = Field(default=4, alias="VOICE_USER_REQUESTS_PER_MINUTE")
    voice_org_daily_request_limit: int = Field(default=80, alias="VOICE_ORG_DAILY_REQUEST_LIMIT")
    voice_cost_per_minute_cents: float = Field(
        default=0.6,
        alias="VOICE_COST_PER_MINUTE_CENTS",
    )

    # SaaS billing / Asaas (separate from OrganizationPaymentSettings client Pix)
    trial_days: int = Field(default=7, alias="TRIAL_DAYS")
    asaas_api_key: str = Field(default="", alias="ASAAS_API_KEY")
    asaas_api_url: str = Field(
        default="https://sandbox.asaas.com/api/v3",
        alias="ASAAS_API_URL",
    )
    asaas_webhook_token: str = Field(default="", alias="ASAAS_WEBHOOK_TOKEN")
    asaas_environment: str = Field(default="sandbox", alias="ASAAS_ENVIRONMENT")
    billing_grace_period_days: int = Field(default=3, alias="BILLING_GRACE_PERIOD_DAYS")
    billing_default_amount_cents: int = Field(default=2990, alias="BILLING_DEFAULT_AMOUNT_CENTS")
    billing_enabled: bool = Field(default=True, alias="BILLING_ENABLED")
    billing_checkout_enabled: bool = Field(default=True, alias="BILLING_CHECKOUT_ENABLED")
    billing_card_enabled: bool = Field(default=False, alias="BILLING_CARD_ENABLED")
    billing_sandbox_allowlist_org_ids: str = Field(
        default="",
        alias="BILLING_SANDBOX_ALLOWLIST_ORG_IDS",
    )
    billing_checkout_minutes_to_expire: int = Field(
        default=60,
        alias="BILLING_CHECKOUT_MINUTES_TO_EXPIRE",
    )
    billing_checkout_rate_limit_max: int = Field(
        default=5,
        alias="BILLING_CHECKOUT_RATE_LIMIT_MAX",
    )
    billing_checkout_rate_limit_window_seconds: int = Field(
        default=300,
        alias="BILLING_CHECKOUT_RATE_LIMIT_WINDOW_SECONDS",
    )

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
    def trusted_proxy_ip_set(self) -> set[str]:
        return {
            part.strip()
            for part in self.trusted_proxy_ips.split(",")
            if part.strip()
        }
    @property
    def resolved_llm_api_key(self) -> str | None:
        """LLM_API_KEY takes precedence; OPENAI_API_KEY is an accepted alias."""
        return self.llm_api_key or self.openai_api_key or None

    @property
    def resolved_llm_model(self) -> str:
        """OPENAI_MODEL wins for OpenAI-family providers unless LLM_MODEL was set explicitly."""
        provider = (self.llm_provider or "").strip().lower()
        if self.llm_model and self.llm_model != "gpt-4.1-mini":
            return self.llm_model
        if provider in {"openai", "openai_responses", "responses"}:
            return self.openai_model
        return self.llm_model

    @property
    def is_production_like(self) -> bool:
        return self.croniu_env.lower() in {"production", "hml", "staging"}

    @property
    def email_from_domain(self) -> str:
        raw = self.email_from or ""
        start = raw.rfind("@")
        if start < 0:
            return ""
        end = raw.find(">", start)
        return (raw[start + 1 :] if end < 0 else raw[start + 1 : end]).strip().lower()

    def validate_production_email_from(self) -> None:
        """Refuse PRD Resend sender outside the verified Croniu mail domain."""
        if self.croniu_env.lower() != "production":
            return
        if (self.email_provider or "").strip().lower() != "resend":
            return
        if self.email_from_domain != "send.croniu.com.br":
            raise ValueError(
                "EMAIL_FROM must use @send.croniu.com.br in production when EMAIL_PROVIDER=resend"
            )

    def validate_email_verification_contract(self) -> None:
        """Fail-closed: production must require e-mail verification (no HML-style bypass)."""
        if self.croniu_env.lower() != "production":
            return
        if not self.email_verification_required:
            raise ValueError(
                "EMAIL_VERIFICATION_REQUIRED must be true in production "
                "(HML soft-gate bypass is not allowed in PRD)"
            )

    @property
    def voice_mime_allowlist(self) -> set[str]:
        return {
            part.strip().lower()
            for part in self.voice_allowed_mime_types.split(",")
            if part.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
