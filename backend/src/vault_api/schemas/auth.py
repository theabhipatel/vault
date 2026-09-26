import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from vault_api.schemas.common import APIModel, EmailIn, Name, Password

Theme = Literal["light", "dark", "system"]


class PublicConfig(APIModel):
    app_name: str
    google_enabled: bool


class SignupIn(EmailIn):
    name: Name
    password: Password


class SigninIn(EmailIn):
    password: str = Field(min_length=1, max_length=256)


class TokenIn(APIModel):
    token: str = Field(min_length=10, max_length=200)


class ResetPasswordIn(TokenIn):
    password: Password


class ChangePasswordIn(APIModel):
    current_password: str | None = Field(default=None, max_length=256)
    new_password: Password


class Me(APIModel):
    id: uuid.UUID
    email: str
    name: str
    avatar_url: str | None
    theme: Theme
    email_verified: bool
    has_password: bool
    google_linked: bool
    default_workspace_id: uuid.UUID | None
    needs_onboarding: bool
    created_at: datetime


class ProfileUpdate(APIModel):
    name: Name | None = None
    theme: Theme | None = None


class SessionOut(APIModel):
    id: uuid.UUID
    created_at: datetime
    last_seen_at: datetime
    ip: str | None
    user_agent: str | None
    current: bool


class DeleteAccountIn(APIModel):
    confirm_email: str = Field(max_length=320)
    password: str | None = Field(default=None, max_length=256)


class AccountActivity(APIModel):
    id: int
    created_at: datetime
    action: str
    result: str
    ip: str | None
    user_agent: str | None
