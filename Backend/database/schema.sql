-- VisitorHub PostgreSQL bootstrap schema.
-- Keep this file aligned with migrations/versions/0001_initial.py.
-- The postgres image runs it only when initializing a new data directory.

CREATE TYPE user_role AS ENUM ('super-admin', 'site-admin', 'host', 'receptionist');
CREATE TYPE visit_status AS ENUM ('scheduled', 'pending', 'checked-in', 'checked-out', 'cancelled', 'rejected');

CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(180) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sites (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    address VARCHAR(300),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sites_organization_name UNIQUE (organization_id, name)
);
CREATE INDEX ix_sites_organization_id ON sites (organization_id);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    full_name VARCHAR(160) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ix_users_email ON users (email);
CREATE INDEX ix_users_organization_id ON users (organization_id);
CREATE INDEX ix_users_site_id ON users (site_id);

CREATE TABLE hosts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    employee_id VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    email VARCHAR(320) NOT NULL,
    department VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_hosts_organization_employee UNIQUE (organization_id, employee_id)
);
CREATE INDEX ix_hosts_organization_id ON hosts (organization_id);
CREATE INDEX ix_hosts_site_id ON hosts (site_id);

CREATE TABLE visitors (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(160) NOT NULL,
    email VARCHAR(320),
    phone VARCHAR(40),
    company VARCHAR(160),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_visitors_organization_id ON visitors (organization_id);
CREATE INDEX ix_visitors_org_email ON visitors (organization_id, email);

CREATE TABLE visits (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE RESTRICT,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
    created_by_id UUID REFERENCES users(id),
    purpose VARCHAR(500) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status visit_status NOT NULL,
    source VARCHAR(24) NOT NULL DEFAULT 'invited',
    pass_digest VARCHAR(64) NOT NULL,
    pass_ciphertext TEXT NOT NULL,
    pass_expires_at TIMESTAMPTZ NOT NULL,
    pass_revoked_at TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    checked_out_at TIMESTAMPTZ,
    check_in_gate VARCHAR(120),
    privacy_consent_at TIMESTAMPTZ,
    nda_signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_visits_organization_id ON visits (organization_id);
CREATE INDEX ix_visits_site_id ON visits (site_id);
CREATE INDEX ix_visits_visitor_id ON visits (visitor_id);
CREATE INDEX ix_visits_host_id ON visits (host_id);
CREATE UNIQUE INDEX ix_visits_pass_digest ON visits (pass_digest);
CREATE INDEX ix_visits_org_site_status ON visits (organization_id, site_id, status);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    visit_id UUID REFERENCES visits(id),
    event_type VARCHAR(80) NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_audit_events_organization_id ON audit_events (organization_id);
CREATE INDEX ix_audit_events_event_type ON audit_events (event_type);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    title VARCHAR(180) NOT NULL,
    message VARCHAR(500) NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_notifications_organization_id ON notifications (organization_id);
CREATE INDEX ix_notifications_recipient_id ON notifications (recipient_id);
CREATE INDEX ix_notifications_recipient_read ON notifications (recipient_id, read);

-- Record the baseline migration because this SQL created revision 0001.
CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);
INSERT INTO alembic_version (version_num) VALUES ('0001_initial');
