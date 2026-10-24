"""
What stands between the open internet and an endpoint that writes (app.routers.usage), apart from Cloudflare's rate limit
in front of the server:

- a limit per visitor, here in the process: so many requests per IP address and time. The address is only kept as a
  salted hash in memory, for as long as its window lasts; nothing of it is stored or logged.
- a cap on the size of a request before it is read in full

The same as feedback's (feature/feedback, app.services.feedback_guard): when both are on main, one of them goes.
"""

import hashlib
import secrets
import time
from collections import OrderedDict, deque

from fastapi import Request


class TooLarge(Exception):
    """The request's body is larger than allowed."""


class RateLimiter:
    """Sliding windows per visitor: windows = ((seconds, at most), ...). hit(key) counts a request and returns None, or
    the seconds until the visitor may try again (the request doesn't count then). Only salted hashes of the keys are
    kept, at most max_keys of them (the longest unused go first): a flood of addresses can't fill the memory."""

    def __init__(self, windows: tuple[tuple[int, int], ...], max_keys: int = 20_000):
        self.windows = windows
        self.longest = max(seconds for seconds, _ in windows)
        self.max_keys = max_keys
        self.salt = secrets.token_bytes(16)  # new with every start of the API: the hashes mean nothing outside it
        self.hits: OrderedDict[bytes, deque[float]] = OrderedDict()

    def key(self, client: str) -> bytes:
        return hashlib.sha256(self.salt + client.encode()).digest()[:16]

    def hit(self, client: str, now: float | None = None) -> int | None:
        now = time.monotonic() if now is None else now
        key = self.key(client)
        times = self.hits.pop(key, None) or deque()
        while times and times[0] <= now - self.longest:
            times.popleft()
        for seconds, limit in self.windows:
            recent = [t for t in times if t > now - seconds]
            if len(recent) >= limit:
                self.hits[key] = times
                return max(1, int(recent[0] + seconds - now) + 1)
        times.append(now)
        self.hits[key] = times  # to the end: the most recently used
        while len(self.hits) > self.max_keys:
            self.hits.popitem(last=False)
        return None


def client_address(request: Request) -> str:
    """The visitor's address: behind Cloudflare its header CF-Connecting-IP (Caddy lets only Cloudflare in, so nobody
    can fake it), locally the connection's."""
    return request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "unknown")


async def read_body(request: Request, limit: int) -> bytes:
    """The body, read only up to limit bytes: a larger one is refused before it fills the memory."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise TooLarge
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > limit:
            raise TooLarge
    return bytes(body)
