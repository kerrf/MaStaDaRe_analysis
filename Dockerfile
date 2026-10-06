FROM python:3.12-slim

# Links the image on ghcr.io to the repository (shown there, and it takes the repository's access rights)
LABEL org.opencontainers.image.source=https://github.com/kerrf/MaStaDaRe_analysis

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Pinned, so the same commit always builds the same image
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /uvx /bin/

WORKDIR /srv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY backend/app ./app

# Not as root: a hole in the app or a library gives an attacker an account that can change nothing, not even the code.
# It owns only the folder itself, where the log (app.log) is written.
RUN useradd --system --uid 10001 --no-create-home app && chown app /srv
USER app

ENV PATH="/srv/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
