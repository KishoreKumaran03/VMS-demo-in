from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    BigInteger, Boolean, Column, Computed, Date, DateTime, Enum, ForeignKey, ForeignKeyConstraint, Identity, Index, Integer,
    SmallInteger, String, Table, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    super_admin = "super-admin"
    site_admin = "site-admin"
    host = "host"
    receptionist = "receptionist"


class VisitStatus(str, enum.Enum):
    pending = "pending"                  # awaiting host/admin approval
    security_review = "security-review"  # blacklist match awaiting a security decision
    scheduled = "scheduled"              # approved; pass issued
    checked_in = "checked-in"            # on site
    temporarily_out = "temporarily-out"  # stepped out, may re-enter on the same pass
    checked_out = "checked-out"          # left; visit complete
    no_show = "no-show"                  # never arrived before the visit ended
    cancelled = "cancelled"
    rejected = "rejected"


TERMINAL_STATUSES = frozenset({VisitStatus.checked_out, VisitStatus.no_show, VisitStatus.cancelled, VisitStatus.rejected})
ON_SITE_STATUSES = frozenset({VisitStatus.checked_in, VisitStatus.temporarily_out})


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(180), unique=True)
    status: Mapped[str] = mapped_column(Text, default="active")
    is_active: Mapped[bool] = mapped_column(Boolean, Computed("status = 'active'", persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    __mapper_args__ = {"version_id_col": version}


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (UniqueConstraint("organization_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    code: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    status: Mapped[str] = mapped_column(Text, default="active")
    is_active: Mapped[bool] = mapped_column(Boolean, Computed("status = 'active'", persisted=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    settings: Mapped["SiteSettings"] = relationship(back_populates="site", uselist=False)

    __mapper_args__ = {"version_id_col": version}


class SiteSettings(Base):
    __tablename__ = "site_settings"

    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True)
    operating_hours: Mapped[dict] = mapped_column(JSONB, default=dict)
    default_visit_hours: Mapped[int] = mapped_column(Integer, default=8)
    walk_in_requires_host_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    overdue_grace_minutes: Mapped[int] = mapped_column(Integer, default=30)
    allow_reentry: Mapped[bool] = mapped_column(Boolean, default=True)
    require_nda: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    site: Mapped[Site] = relationship(back_populates="settings")

    __mapper_args__ = {"version_id_col": version}


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(Text, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Gate(Base):
    __tablename__ = "gates"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    site_id: Mapped[uuid.UUID] = mapped_column()
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(Text, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),
        ForeignKeyConstraint(["organization_id", "gate_id"], ["gates.organization_id", "gates.id"]),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    site_id: Mapped[uuid.UUID] = mapped_column()
    gate_id: Mapped[uuid.UUID | None] = mapped_column()
    name: Mapped[str] = mapped_column(String(120))
    device_type: Mapped[str] = mapped_column(Text)
    credential_hash: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(Text, default="pending")
    enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enrolled_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pairing_code_hash: Mapped[str | None] = mapped_column(String(64))
    pairing_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Person(Base):
    """Central identity record. Holds contact details only; never credentials."""

    __tablename__ = "people"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    full_name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(40))
    company: Mapped[str | None] = mapped_column(String(160))
    identity_status: Mapped[str] = mapped_column(Text, default="active")
    merged_into_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("people.id", ondelete="RESTRICT"))
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    contacts: Mapped[list["PersonContact"]] = relationship(back_populates="person", cascade="all, delete-orphan")

    __mapper_args__ = {"version_id_col": version}


class PersonContact(Base):
    __tablename__ = "person_contacts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"))
    channel: Mapped[str] = mapped_column(Text)
    value: Mapped[str] = mapped_column(String(320))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    person: Mapped[Person] = relationship(back_populates="contacts")


role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", SmallInteger, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", SmallInteger, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True)


class RoleDefinition(Base):
    """Seeded role catalog (`roles` table). `Role` is the matching Python enum of codes."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    scope: Mapped[str] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(SmallInteger)

    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions, lazy="selectin")


class User(Base):
    """Login account. Name and contact details live on the linked Person; the password hash lives in UserCredential."""

    __tablename__ = "users"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "person_id"], ["people.organization_id", "people.id"]),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(unique=True)
    account_status: Mapped[str] = mapped_column(Text, default="active")
    is_active: Mapped[bool] = mapped_column(Boolean, Computed("account_status = 'active'", persisted=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    person: Mapped[Person] = relationship(lazy="joined", innerjoin=True, foreign_keys=[person_id], primaryjoin="User.person_id == Person.id")
    credential: Mapped["UserCredential | None"] = relationship(back_populates="user", uselist=False)
    role_assignments: Mapped[list["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin",
        foreign_keys="UserRole.user_id", primaryjoin="User.id == UserRole.user_id",
    )

    __mapper_args__ = {"version_id_col": version}

    @property
    def full_name(self) -> str:
        return self.person.full_name


class UserCredential(Base):
    __tablename__ = "user_credentials"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    password_hash: Mapped[str] = mapped_column(Text)
    password_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    must_change: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="credential")


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "user_id"], ["users.organization_id", "users.id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column()
    role_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("roles.id", ondelete="RESTRICT"))
    organization_id: Mapped[uuid.UUID] = mapped_column()
    site_id: Mapped[uuid.UUID | None] = mapped_column()
    granted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="role_assignments", foreign_keys=[user_id], primaryjoin="UserRole.user_id == User.id")
    role: Mapped[RoleDefinition] = relationship(lazy="joined")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(40))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(INET)


class PasswordResetRequest(Base):
    __tablename__ = "password_reset_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    channel: Mapped[str] = mapped_column(Text)
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("person_contacts.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    initiated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    request_ip: Mapped[str | None] = mapped_column(INET)


class AuthenticationEvent(Base):
    __tablename__ = "authentication_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(40))
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    event_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Host(Base):
    """Host directory entry: a person who can receive visitors at a site, optionally with a login account."""

    __tablename__ = "hosts"
    __table_args__ = (
        UniqueConstraint("organization_id", "employee_id"),
        ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),
        ForeignKeyConstraint(["organization_id", "person_id"], ["people.organization_id", "people.id"]),
        ForeignKeyConstraint(["organization_id", "user_id"], ["users.organization_id", "users.id"]),
        ForeignKeyConstraint(["organization_id", "department_id"], ["departments.organization_id", "departments.id"]),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(index=True)
    person_id: Mapped[uuid.UUID] = mapped_column()
    user_id: Mapped[uuid.UUID | None] = mapped_column()
    department_id: Mapped[uuid.UUID] = mapped_column()
    employee_id: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(Text, default="active")
    active: Mapped[bool] = mapped_column(Boolean, Computed("status = 'active'", persisted=True))
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    person: Mapped[Person] = relationship(lazy="joined", innerjoin=True, foreign_keys=[person_id], primaryjoin="Host.person_id == Person.id")
    department_ref: Mapped[Department] = relationship(lazy="joined", innerjoin=True, foreign_keys=[department_id], primaryjoin="Host.department_id == Department.id")

    __mapper_args__ = {"version_id_col": version}

    @property
    def name(self) -> str:
        return self.person.full_name

    @property
    def email(self) -> str | None:
        return self.person.email

    @property
    def department(self) -> str:
        return self.department_ref.name


class VisitorProfile(Base):
    """Long-term visitor record (1:1 with a person who has been invited or has visited)."""

    __tablename__ = "visitor_profiles"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "person_id"], ["people.organization_id", "people.id"]),)

    person_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    status: Mapped[str] = mapped_column(Text, default="active")
    classification: Mapped[str] = mapped_column(Text, default="standard")
    identity_review: Mapped[bool] = mapped_column(Boolean, default=False)
    first_visit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_visit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    visit_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    person: Mapped[Person] = relationship(lazy="joined", innerjoin=True, foreign_keys=[person_id], primaryjoin="VisitorProfile.person_id == Person.id")

    __mapper_args__ = {"version_id_col": version}


class PersonMergeLog(Base):
    __tablename__ = "person_merge_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    source_person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("people.id", ondelete="RESTRICT"))
    target_person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("people.id", ondelete="RESTRICT"))
    merged_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reason: Mapped[str] = mapped_column(String(500))
    moved_counts: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Invitation(Base):
    """A host's pre-registration request. Its visit row is created alongside it and carries the operational state."""

    __tablename__ = "invitations"
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),
        ForeignKeyConstraint(["organization_id", "host_id"], ["hosts.organization_id", "hosts.id"]),
        ForeignKeyConstraint(["organization_id", "visitor_person_id"], ["people.organization_id", "people.id"]),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    site_id: Mapped[uuid.UUID] = mapped_column()
    host_id: Mapped[uuid.UUID] = mapped_column()
    visitor_person_id: Mapped[uuid.UUID] = mapped_column()
    purpose: Mapped[str] = mapped_column(String(500))
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    scheduled_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, default="pending")
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    cancelled_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    __mapper_args__ = {"version_id_col": version}


class Visit(Base):
    """One actual (or expected) visit. `status` is the current state; `visit_events` is the full history."""

    __tablename__ = "visits"
    __table_args__ = (
        Index("ix_visits_org_site_status", "organization_id", "site_id", "status"),
        ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),
        ForeignKeyConstraint(["organization_id", "host_id"], ["hosts.organization_id", "hosts.id"]),
        ForeignKeyConstraint(["organization_id", "visitor_person_id"], ["people.organization_id", "people.id"]),
        ForeignKeyConstraint(["organization_id", "invitation_id"], ["invitations.organization_id", "invitations.id"]),
        ForeignKeyConstraint(["organization_id", "created_by_device_id"], ["devices.organization_id", "devices.id"]),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(index=True)
    visitor_person_id: Mapped[uuid.UUID] = mapped_column()
    host_id: Mapped[uuid.UUID] = mapped_column(index=True)
    invitation_id: Mapped[uuid.UUID | None] = mapped_column()
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    created_by_device_id: Mapped[uuid.UUID | None] = mapped_column()
    purpose: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(Text, default="business")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[VisitStatus] = mapped_column(Enum(VisitStatus, native_enum=False, create_constraint=False, length=20,
                                                     values_callable=lambda states: [state.value for state in states]), default=VisitStatus.pending)
    source: Mapped[str] = mapped_column(String(24), default="invited")
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)   # first entry
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # final exit
    check_in_gate: Mapped[str | None] = mapped_column(String(120), nullable=True)
    overdue_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    privacy_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nda_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retention_eligible_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    visitor: Mapped[Person] = relationship(foreign_keys=[visitor_person_id], primaryjoin="Visit.visitor_person_id == Person.id")
    host: Mapped[Host] = relationship(foreign_keys=[host_id], primaryjoin="Visit.host_id == Host.id")
    pass_: Mapped["Pass | None"] = relationship(back_populates="visit", uselist=False, foreign_keys="Pass.visit_id", primaryjoin="Visit.id == Pass.visit_id")

    __mapper_args__ = {"version_id_col": version}


class VisitEvent(Base):
    """Append-only history of a visit. A client-supplied id makes a retried request a no-op."""

    __tablename__ = "visit_events"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"]),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    visit_id: Mapped[uuid.UUID] = mapped_column()
    event_type: Mapped[str] = mapped_column(Text)
    from_status: Mapped[str | None] = mapped_column(Text)
    to_status: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id", ondelete="RESTRICT"))
    gate_label: Mapped[str | None] = mapped_column(String(120))
    pass_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("passes.id", ondelete="RESTRICT"))
    reason: Mapped[str | None] = mapped_column(String(500))
    event_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)


class Pass(Base):
    """The visit's QR credential. Only a SHA-256 of the token is used for lookup; token_ciphertext lets staff
    re-display an active pass and is cleared when the pass stops being active."""

    __tablename__ = "passes"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"]),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    visit_id: Mapped[uuid.UUID] = mapped_column(unique=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    token_ciphertext: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="active")
    usage: Mapped[str] = mapped_column(Text, default="multi_entry")
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    issued_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    issued_by_device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id", ondelete="RESTRICT"))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    revoke_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    visit: Mapped[Visit] = relationship(back_populates="pass_", foreign_keys=[visit_id], primaryjoin="Pass.visit_id == Visit.id")


class PassScan(Base):
    """Every pass validation attempt, accepted or rejected (rejections are the security-relevant ones)."""

    __tablename__ = "pass_scans"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    pass_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("passes.id", ondelete="RESTRICT"))
    site_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sites.id", ondelete="RESTRICT"))
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id", ondelete="RESTRICT"))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str] = mapped_column(Text)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    scope: Mapped[str] = mapped_column(String(80), primary_key=True)
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    response_status: Mapped[int | None] = mapped_column(Integer)
    response_body: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    """Append-only record of significant actions. Never holds passwords, tokens, OTPs or pass codes.
    entity_id has no foreign key on purpose: the audit trail must outlive the rows it describes."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    actor_device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID | None] = mapped_column()
    site_id: Mapped[uuid.UUID | None] = mapped_column()
    correlation_id: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(INET)
    event_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    """One message to one user on one channel. In-app rows are delivered on insert; email/SMS rows are
    queued and delivered by the outbox worker, with each try recorded in notification_attempts."""

    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_recipient_read", "recipient_id", "read"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    recipient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    visit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("visits.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40), default="general")
    channel: Mapped[str] = mapped_column(Text, default="in_app")
    status: Mapped[str] = mapped_column(Text, default="delivered")
    title: Mapped[str] = mapped_column(String(180))
    message: Mapped[str] = mapped_column(String(500))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NotificationAttempt(Base):
    __tablename__ = "notification_attempts"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    notification_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notifications.id", ondelete="CASCADE"))
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    provider: Mapped[str | None] = mapped_column(String(40))
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    outcome: Mapped[str] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(80))


class OutboxEvent(Base):
    """Transactional outbox: written in the same transaction as the change it announces and processed
    afterwards by the worker. `id` is monotonic, so it doubles as a synchronization cursor."""

    __tablename__ = "outbox_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(unique=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    aggregate_type: Mapped[str] = mapped_column(String(40))
    aggregate_id: Mapped[uuid.UUID] = mapped_column()
    aggregate_version: Mapped[int | None] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String(500))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dead_lettered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JobRun(Base):
    __tablename__ = "job_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    job_name: Mapped[str] = mapped_column(String(60))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, default="running")
    dry_run: Mapped[bool] = mapped_column(Boolean, default=False)
    counts: Mapped[dict] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(String(1000))


class BlacklistEntry(Base):
    """A restriction on a person or on identifiers (email/phone/name) for an organization or one site.
    Holds only what matching and the security decision need; reason_detail is restricted to blacklist.manage."""

    __tablename__ = "blacklist_entries"
    __table_args__ = (
        ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),
        ForeignKeyConstraint(["organization_id", "person_id"], ["people.organization_id", "people.id"]),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    site_id: Mapped[uuid.UUID | None] = mapped_column()
    person_id: Mapped[uuid.UUID | None] = mapped_column()
    match_name: Mapped[str | None] = mapped_column(String(160))
    match_email: Mapped[str | None] = mapped_column(String(320))
    match_phone_digits: Mapped[str | None] = mapped_column(String(40))
    reason_category: Mapped[str] = mapped_column(Text)
    reason_detail: Mapped[str | None] = mapped_column(String(1000))
    severity: Mapped[str] = mapped_column(Text)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, default="active")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    lifted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lift_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1)

    __mapper_args__ = {"version_id_col": version}


class BlacklistMatch(Base):
    __tablename__ = "blacklist_matches"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"]),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    blacklist_entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("blacklist_entries.id", ondelete="RESTRICT"))
    visit_id: Mapped[uuid.UUID] = mapped_column()
    match_basis: Mapped[str] = mapped_column(Text)
    confidence: Mapped[str] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    entry: Mapped[BlacklistEntry] = relationship(lazy="joined")


class SecurityApproval(Base):
    """A security decision about one visit. Approval covers the matches that existed when it was decided;
    a later blacklist entry triggers a new review at the next entry attempt."""

    __tablename__ = "security_approvals"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"]),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column()
    visit_id: Mapped[uuid.UUID] = mapped_column()
    status: Mapped[str] = mapped_column(Text, default="pending")
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_reason: Mapped[str | None] = mapped_column(String(500))


class RetentionPolicy(Base):
    """How long a class of records is kept. Platform defaults have no organization; overrides narrow by organization/site."""

    __tablename__ = "retention_policies"
    __table_args__ = (ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"]),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    site_id: Mapped[uuid.UUID | None] = mapped_column()
    record_class: Mapped[str] = mapped_column(Text)
    retain_months: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(Text)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RetentionHold(Base):
    """Keeps a visit or person beyond policy. Needs a reason, an authorized role and a review date within 12 months."""

    __tablename__ = "retention_holds"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID] = mapped_column()
    hold_type: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(String(500))
    case_reference: Mapped[str | None] = mapped_column(String(120))
    placed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    review_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    released_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    release_reason: Mapped[str | None] = mapped_column(String(500))


class VisitDailyStat(Base):
    """De-identified daily counts that outlive anonymized visits."""

    __tablename__ = "visit_daily_stats"

    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"))
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id", ondelete="RESTRICT"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    source: Mapped[str] = mapped_column(Text, primary_key=True)
    category: Mapped[str] = mapped_column(Text, primary_key=True)
    final_status: Mapped[str] = mapped_column(Text, primary_key=True)
    visits: Mapped[int] = mapped_column(Integer, default=0)
    total_minutes_on_site: Mapped[int] = mapped_column(BigInteger, default=0)


class BackupRun(Base):
    """Written by the backup container (backup/backup.sh) and the restore test."""

    __tablename__ = "backup_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, default="running")
    location: Mapped[str | None] = mapped_column(String(500))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    checksum: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(String(1000))
