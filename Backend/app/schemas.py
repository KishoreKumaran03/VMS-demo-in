import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from .models import Role, VisitStatus


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: Role
    organization_id: uuid.UUID
    site_id: uuid.UUID | None

    model_config = ConfigDict(from_attributes=True)


class AccountUserOut(UserOut):
    employee_id: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class InitialSignupRequest(BaseModel):
    setup_key: str = Field(min_length=1, max_length=256)
    organization_name: str = Field(min_length=1, max_length=180)
    site_name: str = Field(min_length=1, max_length=180)
    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class HostOut(BaseModel):
    id: uuid.UUID
    employee_id: str
    name: str
    department: str
    site_id: uuid.UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class HostCreate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    department: str = Field(min_length=1, max_length=120)
    site_id: uuid.UUID | None = None


class HostAccountCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    employee_id: str = Field(min_length=1, max_length=80)
    department: str = Field(min_length=1, max_length=120)
    site_id: uuid.UUID | None = None


class HostAccountOut(BaseModel):
    user: UserOut
    host: HostOut


class HostPatch(BaseModel):
    employee_id: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    email: EmailStr | None = None
    department: str | None = Field(default=None, min_length=1, max_length=120)


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    address: str | None = Field(default=None, max_length=300)
    organization_id: uuid.UUID | None = None


class SitePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    address: str | None = Field(default=None, max_length=300)


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class SiteOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    address: str | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class NotificationOut(BaseModel):
    id: uuid.UUID
    visit_id: uuid.UUID | None
    title: str
    message: str
    read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditOut(BaseModel):
    id: uuid.UUID
    visit_id: uuid.UUID | None
    event_type: str
    detail: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    role: Role
    site_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None


class UserPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    role: Role | None = None
    site_id: uuid.UUID | None = None


class VisitCreate(BaseModel):
    visitor_name: str = Field(min_length=1, max_length=160)
    visitor_email: EmailStr | None = None
    visitor_phone: str | None = Field(default=None, max_length=40)
    company: str | None = Field(default=None, max_length=160)
    host_id: uuid.UUID
    site_id: uuid.UUID | None = None
    purpose: str = Field(min_length=1, max_length=500)
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def valid_period(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Visit end must be after its start")
        return self


class VisitPatch(BaseModel):
    purpose: str | None = Field(default=None, min_length=1, max_length=500)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    host_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def valid_period(self):
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("Visit end must be after its start")
        return self


class VisitorOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: EmailStr | None
    phone: str | None
    company: str | None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VisitorPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    company: str | None = Field(default=None, max_length=160)


class RejectVisit(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class VisitOut(BaseModel):
    id: uuid.UUID
    visitor_id: uuid.UUID
    visitor_name: str
    visitor_email: EmailStr | None
    visitor_phone: str | None
    company: str | None
    host_id: uuid.UUID
    host_name: str
    host_department: str
    site_id: uuid.UUID
    purpose: str
    starts_at: datetime
    ends_at: datetime
    status: VisitStatus
    source: str
    pass_code: str | None = None
    checked_in_at: datetime | None
    checked_out_at: datetime | None
    check_in_gate: str | None


class KioskRequestOut(BaseModel):
    id: uuid.UUID
    status: VisitStatus
    pass_code: str | None = None
    host_name: str

    model_config = ConfigDict(from_attributes=True)


class WalkInCreate(BaseModel):
    visitor_name: str = Field(min_length=1, max_length=160)
    visitor_email: EmailStr | None = None
    visitor_phone: str = Field(min_length=7, max_length=40)
    company: str | None = Field(default=None, max_length=160)
    host_id: uuid.UUID
    site_id: uuid.UUID
    purpose: str = Field(min_length=1, max_length=500)
    consent_accepted: bool
    nda_accepted: bool

    @model_validator(mode="after")
    def require_agreements(self):
        if not self.consent_accepted or not self.nda_accepted:
            raise ValueError("Privacy notice and NDA acceptance are required")
        return self
