from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    timezone: str = "America/Sao_Paulo"
    profession_code: str | None = None
    profession_specialty: str | None = None
    profession_other: str | None = None
    profession_onboarding_done: bool = False


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)
    organization_name: str = Field(min_length=2, max_length=200)
    profession_code: str | None = None
    profession_specialty: str | None = None
    profession_other: str | None = None
    use_cases: list[str] | None = None
    referral_code: str | None = Field(default=None, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    created_at: datetime


class MeResponse(BaseModel):
    user: UserOut
    organization: OrganizationOut
    role: str


class MessageResponse(BaseModel):
    message: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetRequestResponse(BaseModel):
    message: str
    """Present only in non-production to allow local testing without e-mail."""
    dev_reset_token: str | None = None


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class ErrorResponse(BaseModel):
    code: str
    message: str
