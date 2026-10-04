import os

# Tests that import the API (routers) load app.core.config, whose settings come from backend/.env. CI has no .env, so
# the tests get placeholders; none of them connects to the database. A real .env still wins (setdefault).
for key, value in {
    "DATABASE_URL": "postgresql://test:test@localhost:5432/test",
    "API_PREFIX": "",
    "ALLOWED_ORIGINS": "http://localhost:5173",
    "DEBUG": "False",
}.items():
    os.environ.setdefault(key, value)
