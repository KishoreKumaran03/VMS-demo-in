"""Incremental change feed and reconciliation snapshot."""
from datetime import timedelta

from sqlalchemy import update

from app.models import OutboxEvent, utcnow

from .conftest import login
from .test_visits import approved


def age_events(db):
    db.execute(update(OutboxEvent).values(created_at=utcnow() - timedelta(minutes=1)))
    db.commit()


def test_cursor_paging_is_complete_and_ordered(client, db, make, world):
    make.user(world["org"], "super-admin", email="root@example.com")
    root = login(client, "root@example.com")
    for i in range(3):
        approved(client, world, name=f"Feed Person {i}", email=f"feed{i}@guest.com")
    assert client.get("/api/v1/sync/events", headers=root).json()["events"] == []  # inside the safety lag
    age_events(db)
    seen, cursor = [], 0
    while True:
        page = client.get("/api/v1/sync/events", headers=root, params={"after": cursor, "limit": 2}).json()
        seen += page["events"]
        cursor = page["next_cursor"]
        if not page["has_more"]:
            break
    ids = [e["id"] for e in seen]
    assert ids == sorted(ids) and len(ids) == len(set(ids)) == 6  # created + status_changed per visit
    assert len({e["event_id"] for e in seen}) == 6
    assert all("visitor" not in str(e["payload"]).lower() and "@" not in str(e["payload"]) for e in seen)
    # A consumer that re-reads from an old cursor gets the same events again (it deduplicates on event_id).
    replay = client.get("/api/v1/sync/events", headers=root, params={"after": ids[1]}).json()["events"]
    assert [e["event_id"] for e in replay] == [e["event_id"] for e in seen[2:]]


def test_versions_let_consumers_drop_stale_updates(client, db, make, world):
    make.user(world["org"], "super-admin", email="root@example.com")
    root = login(client, "root@example.com")
    visit = approved(client, world)
    client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
    age_events(db)
    events = [e for e in client.get("/api/v1/sync/events", headers=root).json()["events"] if e["aggregate_id"] == visit["id"]]
    versions = [e["aggregate_version"] for e in events]
    assert versions == sorted(versions) and len(set(versions)) == len(versions)
    snapshot = client.get("/api/v1/sync/visits", headers=root).json()["visits"]
    current = next(v for v in snapshot if v["id"] == visit["id"])
    assert current["version"] == versions[-1] and current["status"] == "checked-in"
    assert set(current) == {"id", "version", "status", "organization_id", "site_id", "host_id", "starts_at", "ends_at", "updated_at", "anonymized"}


def test_feed_requires_platform_admin(client, world):
    assert client.get("/api/v1/sync/events", headers=world["admin"]).status_code == 403
