FROM python:3.12-slim

ARG GIT_SHA=unknown
ARG APP_VERSION=0.0.0-dev
ARG BUILD_TIME=
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.created=$BUILD_TIME
LABEL org.opencontainers.image.source="https://github.com/palexsfc10/croniu-app"

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GIT_SHA=$GIT_SHA \
    APP_VERSION=$APP_VERSION \
    BUILD_TIME=$BUILD_TIME

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY requirements.txt ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY scripts ./scripts

# Pins must match requirements.txt (CI + image + HML). No floating >= for Alembic/SQLAlchemy.
RUN pip install --no-cache-dir \
    "fastapi[standard]==0.140.0" \
    "sqlalchemy==2.0.51" \
    "alembic==1.19.1" \
    "pydantic-settings==2.14.2" \
    "pwdlib[argon2]==0.3.0" \
    "psycopg[binary]==3.3.4" \
    "email-validator==2.3.0" \
    "python-dotenv==1.2.2" \
    "google-auth==2.35.0" \
    "requests==2.32.3"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
