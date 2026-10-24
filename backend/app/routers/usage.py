"""
Which settings of the website get used: the pages send what was chosen (a view's settings, a share, the tour, a tip)
in small batches, and this counts them. Each request passes, from cheap to expensive:

  switched on and set up → from the website's own pages (Origin) → limit per visitor → size → known events and short,
  plain settings → the database, as a role that may only add rows, whose trigger refuses more than the daily cap

Nothing of the visitor is stored: no IP address, no cookie, no id, only the day. The body comes as text/plain, which a
browser sends without asking first (navigator.sendBeacon, also when the page is closed). Setup and reading: DEPLOY.md
"Nutzungszahlen", app.etl.usage_report.
"""

import json
import re
from logging import getLogger

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.services import usage_store
from app.services.request_guard import RateLimiter, TooLarge, client_address, read_body

logger = getLogger(__name__)
router = APIRouter(prefix="/usage", tags=["Nutzung"])

MAX_BYTES = 6 * 1024
MAX_EVENTS = 25  # a batch: the page sends every few seconds and when it is left
MAX_PROPS = 10
# Per visitor (IP address): (seconds, at most) requests. A visit sends a batch every few seconds at most.
LIMITS = ((60, 30), (86_400, 1500))

# The events the website sends (frontend/src/lib/usage.js and its callers): anything else is refused
EVENTS = {
    "Ansicht",
    "Kartenansicht",
    "Grafikexport",
    "Kartenexport",
    "Filter",
    "Zeitraum",
    "Technologie",
    "Gemeinde",
    "Teilen",
    "Tour",
    "Tipp",
}
KEY = re.compile(r"^[a-z][a-z_]{0,23}$")
# A setting's value: a word, an id, a year or month, a page – letters, digits and a few signs, no markup
VALUE = re.compile(r"^[\w .,:/+\-–’()%]{1,60}$")

limiter = RateLimiter(LIMITS)


def origins() -> set[str]:
    return {origin.strip() for origin in settings.USAGE_ORIGINS.split(",") if origin.strip()}


def is_open() -> bool:
    return bool(settings.USAGE_ENABLED and settings.USAGE_DATABASE_URL)


def foreign_origin(request: Request) -> bool:
    """A page of another site sending this (a browser always says which): refused, so nobody can make the visitors of
    their site count with us. Bots name any origin they like – for them there are the limits and the daily cap."""
    origin = request.headers.get("origin")
    return origin is not None and origin not in origins()


def parse(body: bytes) -> list[tuple[str, dict[str, str]]] | None:
    """The batch's events as (name, settings), or None where anything in it isn't what the website sends."""
    try:
        data = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    events = data.get("events") if isinstance(data, dict) else None
    if not isinstance(events, list) or not 0 < len(events) <= MAX_EVENTS:
        return None
    out = []
    for event in events:
        if not isinstance(event, dict) or set(event) - {"name", "props"}:
            return None
        name, props = event.get("name"), event.get("props", {})
        if name not in EVENTS or not isinstance(props, dict) or len(props) > MAX_PROPS:
            return None
        clean = {}
        for key, value in props.items():
            if isinstance(value, bool) or not isinstance(value, (str, int, float)):
                return None
            value = str(value)
            if not KEY.match(key) or not VALUE.match(value):
                return None
            clean[key] = value
        out.append((name, clean))
    return out


@router.post("", status_code=204)
async def post_usage(request: Request):
    """A batch of counts from the website's pages. 204 when counted; the page doesn't wait for the answer anyway."""
    if not is_open():
        return JSONResponse({"detail": "Nutzungszahlen sind abgeschaltet."}, status_code=503)
    if foreign_origin(request):
        return JSONResponse({"detail": "Nur von den Seiten der Website."}, status_code=403)
    wait = limiter.hit(client_address(request))
    if wait:
        return JSONResponse({"detail": "Zu viele Anfragen."}, status_code=429, headers={"Retry-After": str(wait)})
    try:
        body = await read_body(request, MAX_BYTES)
    except TooLarge:
        return JSONResponse({"detail": "Zu groß."}, status_code=413)
    events = parse(body)
    if events is None:
        return JSONResponse({"detail": "Unbekannte Angaben."}, status_code=400)
    try:
        await run_in_threadpool(usage_store.add_events, events)
    except usage_store.CapReached:
        return JSONResponse({"detail": "Für heute genug gezählt."}, status_code=429)
    except Exception:
        logger.warning("Usage: counting failed", exc_info=True)
        return JSONResponse({"detail": "Gerade nicht möglich."}, status_code=503)
    return Response(status_code=204)
