"""The headers every answer of the API gets (app.main): the same for everybody, so Cloudflare can keep one copy of it.
The app is called as the server calls it (ASGI), on routes that need no database."""

import asyncio

from app.main import CACHE_CONTROL, app


def call(method: str, path: str, headers: list[tuple[bytes, bytes]] = ()) -> tuple[int, dict[str, str]]:
    """The status and headers of the app's answer to one request."""
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"api.mastr-data.de"), *headers],
        "client": ("203.0.113.7", 50000),
        "server": ("api.mastr-data.de", 443),
    }
    asyncio.run(app(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    return start["status"], {name.decode().lower(): value.decode() for name, value in start["headers"]}


def test_a_found_get_may_be_kept_by_everybody():
    status, headers = call("GET", "/openapi.json")
    assert status == 200
    assert headers["cache-control"] == CACHE_CONTROL
    assert headers["access-control-allow-origin"] == "*"


def test_the_answer_does_not_depend_on_the_asking_site():
    # A browser on another site, with a cookie: still "*", never its name (a cached copy would hand it to everybody)
    _, headers = call("GET", "/openapi.json", [(b"origin", b"https://example.org"), (b"cookie", b"a=1")])
    assert headers["access-control-allow-origin"] == "*"
    assert "vary" not in headers


def test_errors_are_never_kept():
    status, headers = call("GET", "/no-such-route")
    assert status == 404
    assert headers["cache-control"] == "no-store"
    assert headers["access-control-allow-origin"] == "*"


def test_a_browser_may_ask_first():
    status, headers = call("OPTIONS", "/solar/orientation", [(b"origin", b"https://www.mastr-data.de")])
    assert status == 204
    assert headers["access-control-allow-origin"] == "*"
    assert "GET" in headers["access-control-allow-methods"]
    assert headers["cache-control"] == "no-store"
