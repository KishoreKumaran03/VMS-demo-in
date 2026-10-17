from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    database_url: str | None = None
    database_host: str = "localhost"
    database_port: int = 5432
    database_name: str = "visitorhub"
    database_user: str = "visitorhub"
    database_password: str = "change-me"
    app_env: str = "production"
    jwt_secret: str = "development-only-change-this-secret-before-deploying"
    # HMAC key for stored reset/pass token hashes. Kept separate from JWT_SECRET so one leak does not expose both.
    token_pepper: str = "development-only-token-pepper"
    # Encrypts the re-displayable copy of active pass tokens (passes.token_ciphertext). Independent of JWT_SECRET.
    pass_encryption_key: str = "development-only-pass-encryption-key"
    access_token_minutes: int = 30
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:5173"
    initial_setup_key: str = ""
    dashboard_url: str = "http://localhost:3000"

    # Login lockout.
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    login_ip_failures_per_15_minutes: int = 50

    # Password recovery policy (documented in docs/DATABASE_DESIGN.md §4.2).
    reset_token_minutes: int = 30
    reset_token_minutes_privileged: int = 15
    reset_resend_cooldown_seconds: int = 60
    reset_requests_per_user_per_hour: int = 5
    reset_requests_per_ip_per_hour: int = 20
    # Outgoing email (reset links, notification copies): "console" prints to stderr and only works with
    # APP_ENV=development; "disabled" sends nothing. Connect a provider in services/notify.py:send_email.
    email_delivery: str = "disabled"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return URL.create(
            "postgresql+psycopg",
            username=self.database_user,
            password=self.database_password,
            host=self.database_host,
            port=self.database_port,
            database=self.database_name,
        ).render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
