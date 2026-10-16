import uuid
from datetime import datetime
from zoneinfo import available_timezones

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

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
    # site_id is kept for existing clients: the single assigned site, or None for org-wide/multi-site roles.
    site_id: uuid.UUID | None
    site_ids: list[uuid.UUID] | None
    account_status: str
    version: int


class PasswordResetStart(BaseModel):
    email: EmailStr


class PasswordResetFinish(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=12, max_length=128)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=128)


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
    active: bool = True
    has_account: bool = False
    version: int = 1

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
    active: bool | None = None
    version: int | None = None


class DepartmentOut(BaseModel):
    id: uuid.UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


class SiteSettingsOut(BaseModel):
    site_id: uuid.UUID
    operating_hours: dict
    default_visit_hours: int
    walk_in_requires_host_approval: bool
    overdue_grace_minutes: int
    allow_reentry: bool
    require_nda: bool
    version: int

    model_config = ConfigDict(from_attributes=True)


class SiteSettingsPatch(BaseModel):
    operating_hours: dict | None = None
    default_visit_hours: int | None = Field(default=None, ge=1, le=72)
    walk_in_requires_host_approval: bool | None = None
    overdue_grace_minutes: int | None = Field(default=None, ge=0, le=1440)
    allow_reentry: bool | None = None
    require_nda: bool | None = None
    version: int | None = None


DeviceType = Literal["kiosk", "scanner", "badge_printer"]


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    site_id: uuid.UUID
    device_type: DeviceType = "kiosk"


class DeviceOut(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    device_type: str
    status: str
    enrolled_at: datetime | None
    last_seen_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class DevicePairingOut(BaseModel):
    device: DeviceOut
    pairing_code: str
    pairing_expires_at: datetime


class KioskPairRequest(BaseModel):
    pairing_code: str = Field(min_length=4, max_length=20)


class KioskPairOut(BaseModel):
    device_key: str
    device: DeviceOut
    site_name: str


class KioskIdentityOut(BaseModel):
    device: DeviceOut
    site_name: str
    require_nda: bool


def _valid_timezone(value: str | None) -> str | None:
    if value is not None and value not in available_timezones():
        raise ValueError("Timezone must be an IANA name such as Europe/London")
    return value


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    code: str | None = Field(default=None, min_length=1, max_length=40)
    address: str | None = Field(default=None, max_length=300)
    timezone: str = Field(default="UTC", max_length=64)
    organization_id: uuid.UUID | None = None

    _timezone = field_validator("timezone")(_valid_timezone)


class SitePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    code: str | None = Field(default=None, min_length=1, max_length=40)
    address: str | None = Field(default=None, max_length=300)
    timezone: str | None = Field(default=None, max_length=64)
    version: int | None = None

    _timezone = field_validator("timezone")(_valid_timezone)


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class SiteOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    code: str | None
    address: str | None
    timezone: str
    status: str
    is_active: bool
    version: int

    model_config = ConfigDict(from_attributes=True)


class NotificationOut(BaseModel):
    id: uuid.UUID
    visit_id: uuid.UUID | None
    kind: str
    title: str
    message: str
    read: bool
    read_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VisitEventOut(BaseModel):
    id: uuid.UUID
    event_type: str
    from_status: str | None
    to_status: str | None
    occurred_at: datetime
    actor_user_id: uuid.UUID | None
    device_id: uuid.UUID | None
    gate_label: str | None
    reason: str | None

    model_config = ConfigDict(from_attributes=True)


class GateIn(BaseModel):
    gate: str | None = Field(default=None, max_length=120)


class PassCheck(BaseModel):
    code: str = Field(min_length=1, max_length=200)


class AuditOut(BaseModel):
    id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    site_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    actor_device_id: uuid.UUID | None
    correlation_id: str | None
    metadata: dict
    created_at: datetime
    # Kept for existing clients: event_type == action; visit_id is set for visit entries; detail summarizes metadata.
    event_type: str
    visit_id: uuid.UUID | None
    detail: str | None


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    role: Role
    site_id: uuid.UUID | None = None
    # Multi-site assignment; when given it replaces site_id.
    site_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)
    organization_id: uuid.UUID | None = None


class UserPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    role: Role | None = None
    site_id: uuid.UUID | None = None
    site_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)
    # Optimistic locking: when supplied, the update is rejected with 409 if the account changed since it was read.
    version: int | None = None


VisitCategory = Literal["business", "interview", "contractor", "delivery", "personal", "other"]


class VisitCreate(BaseModel):
    visitor_name: str = Field(min_length=1, max_length=160)
    visitor_email: EmailStr | None = None
    visitor_phone: str | None = Field(default=None, max_length=40)
    company: str | None = Field(default=None, max_length=160)
    host_id: uuid.UUID
    site_id: uuid.UUID | None = None
    purpose: str = Field(min_length=1, max_length=500)
    category: VisitCategory = "business"
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
    version: int | None = None

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
    classification: str
    visit_count: int
    first_visit_at: datetime | None
    last_visit_at: datetime | None
    identity_review: bool
    notes: str | None
    version: int


class VisitorPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    company: str | None = Field(default=None, max_length=160)
    classification: Literal["standard", "frequent", "contractor", "vip", "restricted"] | None = None
    notes: str | None = Field(default=None, max_length=1000)
    identity_review: bool | None = None


class VisitorMerge(BaseModel):
    source_id: uuid.UUID
    target_id: uuid.UUID
    reason: str = Field(min_length=5, max_length=500)


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
    category: str = "business"
    invitation_id: uuid.UUID | None = None
    pass_expires_at: datetime | None = None
    overdue: bool = False
    version: int = 1


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


ReasonCategory = Literal["safety", "theft", "harassment", "trespass", "legal_order", "policy_violation", "other"]


class BlacklistCreate(BaseModel):
    """At least one identifier is required. Store only what matching and the decision need."""

    person_id: uuid.UUID | None = None
    match_name: str | None = Field(default=None, min_length=2, max_length=160)
    match_email: EmailStr | None = None
    match_phone: str | None = Field(default=None, min_length=7, max_length=40)
    site_id: uuid.UUID | None = None
    reason_category: ReasonCategory
    reason_detail: str | None = Field(default=None, max_length=1000)
    severity: Literal["deny", "require_approval"] = "require_approval"
    effective_until: datetime | None = None
    review_due_at: datetime | None = None

    @model_validator(mode="after")
    def has_identifier(self):
        if not (self.person_id or self.match_name or self.match_email or self.match_phone):
            raise ValueError("Give a person or at least one identifier (name, email or phone)")
        return self


class BlacklistPatch(BaseModel):
    reason_category: ReasonCategory | None = None
    reason_detail: str | None = Field(default=None, max_length=1000)
    severity: Literal["deny", "require_approval"] | None = None
    effective_until: datetime | None = None
    review_due_at: datetime | None = None
    version: int | None = None


class BlacklistLift(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class BlacklistOut(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID | None
    person_id: uuid.UUID | None
    match_name: str | None
    match_email: str | None
    match_phone_digits: str | None
    reason_category: str
    reason_detail: str | None
    severity: str
    effective_from: datetime
    effective_until: datetime | None
    review_due_at: datetime
    status: str
    created_by: uuid.UUID
    created_at: datetime
    lifted_at: datetime | None
    lift_reason: str | None
    version: int

    model_config = ConfigDict(from_attributes=True)


class BlacklistMatchOut(BaseModel):
    id: uuid.UUID
    blacklist_entry_id: uuid.UUID
    match_basis: str
    confidence: str
    severity: str
    reason_category: str
    reviewed_at: datetime | None


class SecurityApprovalOut(BaseModel):
    id: uuid.UUID
    visit_id: uuid.UUID
    status: str
    requested_at: datetime
    decided_by: uuid.UUID | None
    decided_at: datetime | None
    decision_reason: str | None
    visitor_name: str
    host_name: str
    site_id: uuid.UUID
    visit_status: str
    matches: list[BlacklistMatchOut]


class MatchReview(BaseModel):
    match_id: uuid.UUID
    confidence: Literal["confirmed", "uncertain", "rejected"]


class SecurityDecision(BaseModel):
    decision: Literal["approve", "deny"]
    reason: str = Field(min_length=5, max_length=500)
    match_reviews: list[MatchReview] = Field(default_factory=list, max_length=50)


RecordClass = Literal["ordinary_visit", "security_visit", "pass_scan", "notification", "auth_event", "audit_log", "outbox_event", "job_run"]


class RetentionPolicyOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    site_id: uuid.UUID | None
    record_class: str
    retain_months: int
    action: str
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    notes: str | None

    model_config = ConfigDict(from_attributes=True)


class RetentionPolicyIn(BaseModel):
    """organization_id/site_id omitted = platform default (Super Admin only)."""

    organization_id: uuid.UUID | None = None
    site_id: uuid.UUID | None = None
    record_class: RecordClass
    retain_months: int = Field(ge=1, le=120)
    action: Literal["delete", "anonymize"]
    notes: str | None = Field(default=None, max_length=500)


class RetentionHoldIn(BaseModel):
    entity_type: Literal["visit", "person"]
    entity_id: uuid.UUID
    hold_type: Literal["legal", "investigation", "security_incident"]
    reason: str = Field(min_length=10, max_length=500)
    case_reference: str | None = Field(default=None, max_length=120)
    review_due_at: datetime

    @model_validator(mode="after")
    def case_reference_required(self):
        if self.hold_type != "security_incident" and not self.case_reference:
            raise ValueError("Legal and investigation holds need a case reference")
        return self


class RetentionHoldOut(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    hold_type: str
    reason: str
    case_reference: str | None
    placed_by: uuid.UUID
    placed_at: datetime
    review_due_at: datetime
    released_at: datetime | None
    release_reason: str | None

    model_config = ConfigDict(from_attributes=True)


class RetentionHoldRelease(BaseModel):
    reason: str = Field(min_length=5, max_length=500)
    review_due_at: datetime | None = Field(default=None, description="Give this instead of releasing to extend the review date")
