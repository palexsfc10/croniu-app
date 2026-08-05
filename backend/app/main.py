from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import agenda as agenda_routes
from app.api import auth as auth_routes
from app.api import clients as clients_routes
from app.api import cycle_intelligence as cycle_intelligence_routes
from app.api import cycles as cycles_routes
from app.api import health as health_routes
from app.api import home as home_routes
from app.api import platform as platform_routes
from app.api import receivables as receivables_routes
from app.api import services as services_routes
from app.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("croniu")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Croniu API starting")
    yield
    logger.info("Croniu API stopping")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Croniu API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.openapi_enabled else None,
        redoc_url="/redoc" if settings.openapi_enabled else None,
        openapi_url="/openapi.json" if settings.openapi_enabled else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail and "message" in detail:
            return JSONResponse(status_code=exc.status_code, content=detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": "http_error", "message": str(detail)},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "code": "validation_error",
                "message": "Dados inválidos.",
                "details": jsonable_encoder(exc.errors()),
            },
        )

    app.include_router(health_routes.router)
    app.include_router(auth_routes.router, prefix="/api/v1")
    app.include_router(home_routes.router, prefix="/api/v1")
    app.include_router(clients_routes.router, prefix="/api/v1")
    app.include_router(services_routes.router, prefix="/api/v1")
    app.include_router(cycle_intelligence_routes.router, prefix="/api/v1")
    app.include_router(cycles_routes.router, prefix="/api/v1")
    app.include_router(receivables_routes.router, prefix="/api/v1")
    app.include_router(agenda_routes.router, prefix="/api/v1")
    from app.api import agent as agent_routes
    from app.api import evaluations as evaluations_routes
    from app.api import my_cycle as my_cycle_routes
    from app.api import public_my_cycle as public_my_cycle_routes

    app.include_router(my_cycle_routes.router, prefix="/api/v1")
    app.include_router(public_my_cycle_routes.router, prefix="/api/v1")
    app.include_router(evaluations_routes.router, prefix="/api/v1")
    app.include_router(agent_routes.router, prefix="/api/v1")
    from app.api import billing as billing_routes
    from app.api import billing_webhooks as billing_webhooks_routes

    app.include_router(billing_routes.router, prefix="/api/v1")
    app.include_router(billing_webhooks_routes.router, prefix="/api/v1")
    app.include_router(platform_routes.router, prefix="/api/v1")
    return app


app = create_app()
