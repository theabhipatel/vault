"""Application settings, loaded from environment variables (and `.env` in development)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"

    # Public origin of the web app. Used for email links, the Origin check and CORS.
    app_url: str = "http://localhost:29180"
    app_name: str = "Vault"

    database_url: str = "postgresql+asyncpg://vault:vault@localhost:29432/vault"
    database_echo: bool = False

    # Used to sign short-lived OAuth state cookies. Must be long and random in production.
    secret_key: SecretStr = SecretStr("dev-only-insecure-secret-change-me-0123456789")

    # Sessions
    cookie_secure: bool = False
    session_ttl_days: int = 30
    session_idle_days: int = 7

    # Email (SMTP). In development Mailpit catches everything on port 29025.
    smtp_host: str = "localhost"
    smtp_port: int = 29025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    smtp_tls: bool = False
    mail_from: str = "Vault <no-reply@vault.local>"
    email_worker_enabled: bool = True

    # Google sign-in (optional; the button is hidden when unset)
    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None

    # Token lifetimes
    email_verification_ttl_hours: int = 48
    password_reset_ttl_minutes: int = 60
    invitation_ttl_days: int = 7

    # Rate limits (attempts per window)
    signin_ip_limit: int = 30
    signin_email_failure_limit: int = 5
    signin_window_minutes: int = 15
    email_action_limit: int = 5
    email_action_window_minutes: int = 30
    # Submissions of emailed tokens (verification / reset links) per IP per 15 minutes.
    token_submit_ip_limit: int = 30

    max_avatar_bytes: int = Field(default=1_000_000)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def session_cookie_name(self) -> str:
        # The __Host- prefix pins the cookie to this exact origin, but requires Secure.
        return "__Host-vault_session" if self.cookie_secure else "vault_session"

    @property
    def csrf_cookie_name(self) -> str:
        return "__Host-vault_csrf" if self.cookie_secure else "vault_csrf"

    @property
    def oauth_cookie_name(self) -> str:
        return "__Host-vault_oauth" if self.cookie_secure else "vault_oauth"


@lru_cache
def get_settings() -> Settings:
    return Settings()
