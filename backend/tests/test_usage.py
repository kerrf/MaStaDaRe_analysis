"""The usage counts (app.routers.usage): what gets in and what doesn't, called as the server calls the app (ASGI). The
database is replaced by a list: nothing connects."""

import asyncio
import json

import pytest
from app.core.config import settings
from app.main import app
from app.routers import usage
from app.services import usage_store
from app.services.request_guard import RateLimiter

ORIGIN = "https://www.mastr-data.de"


@pytest.fixture
def stored(monkeypatch):
    """Switched on, with a fresh limit per visitor; the rows that would go to the database."""
    rows = []
    monkeypatch.setattr(settings, "USAGE_ENABLED", True)
    monkeypatch.setattr(settings, "USAGE_DATABASE_URL", "postgresql://x@localhost/mastr_usage")
    monkeypatch.setattr(usage, "limiter", RateLimiter(usage.LIMITS))
    monkeypatch.setattr(usage_store, "add_events", rows.extend)
    return rows


def post(body, origin: str | None = ORIGIN, client: str = "203.0.113.7") -> int:
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    messages = []
    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": raw, "more_body": False}

    async def send(message):
        messages.append(message)

    headers = [
        (b"host", b"api.mastr-data.de"),
        (b"content-type", b"text/plain;charset=UTF-8"),
        (b"content-length", str(len(raw)).encode()),
    ]
    if origin:
        headers.append((b"origin", origin.encode()))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/usage",
        "raw_path": b"/usage",
        "query_string": b"",
        "root_path": "",
        "headers": headers,
        "client": (client, 50000),
        "server": ("api.mastr-data.de", 443),
    }
    asyncio.run(app(scope, receive, send))
    return next(m for m in messages if m["type"] == "http.response.start")["status"]


VIEW = {
    "name": "Ansicht",
    "props": {"seite": "erzeuger/karte", "technologie": "wind", "zeit": "2025-03", "besuch": "neu"},
}


def test_a_batch_of_known_events_is_counted(stored):
    assert post({"events": [VIEW, {"name": "Teilen", "props": {"seite": "erzeuger/karte", "weg": "kopiert"}}]}) == 204
    assert stored == [("Ansicht", VIEW["props"]), ("Teilen", {"seite": "erzeuger/karte", "weg": "kopiert"})]


def test_numbers_count_as_text(stored):
    assert post({"events": [{"name": "Zeitraum", "props": {"jahr": 2024}}]}) == 204
    assert stored == [("Zeitraum", {"jahr": "2024"})]


@pytest.mark.parametrize(
    "body",
    [
        {"events": []},
        {"events": [{"name": "Unbekannt", "props": {}}]},
        {"events": [{"name": "Ansicht", "props": {"Seite": "x"}}]},  # keys in lower case
        {"events": [{"name": "Ansicht", "props": {"seite": "<script>"}}]},
        {"events": [{"name": "Ansicht", "props": {"seite": "x" * 61}}]},
        {"events": [{"name": "Ansicht", "props": {"seite": ["x"]}}]},
        {"events": [{"name": "Ansicht", "props": {"seite": True}}]},
        {"events": [{"name": "Ansicht", "props": {f"k{i}": "x" for i in range(11)}}]},
        {"events": [{"name": "Ansicht", "props": {}, "more": 1}]},
        {"events": [VIEW] * 26},
        [VIEW],
    ],
)
def test_anything_else_is_refused_whole(stored, body):
    assert post(body) == 400
    assert stored == []


def test_no_json_is_refused(stored):
    assert post(b"not json") == 400


def test_too_large_is_refused_before_reading(stored):
    assert post(b"x" * (usage.MAX_BYTES + 1)) == 413


def test_another_site_cannot_count(stored):
    assert post({"events": [VIEW]}, origin="https://example.org") == 403
    assert stored == []


def test_without_origin_the_limits_count(stored):
    assert post({"events": [VIEW]}, origin=None) == 204


def test_switched_off_or_not_set_up(stored, monkeypatch):
    monkeypatch.setattr(settings, "USAGE_DATABASE_URL", None)
    assert post({"events": [VIEW]}) == 503
    monkeypatch.setattr(settings, "USAGE_DATABASE_URL", "postgresql://x@localhost/mastr_usage")
    monkeypatch.setattr(settings, "USAGE_ENABLED", False)
    assert post({"events": [VIEW]}) == 503


def test_a_visitor_sending_too_often_waits(stored):
    per_minute = usage.LIMITS[0][1]
    for _ in range(per_minute):
        assert post({"events": [VIEW]}, client="198.51.100.1") == 204
    assert post({"events": [VIEW]}, client="198.51.100.1") == 429
    assert post({"events": [VIEW]}, client="198.51.100.2") == 204


def test_the_daily_cap_of_the_database(stored, monkeypatch):
    def full(_):
        raise usage_store.CapReached("usage_cap: events per day")

    monkeypatch.setattr(usage_store, "add_events", full)
    assert post({"events": [VIEW]}) == 429
