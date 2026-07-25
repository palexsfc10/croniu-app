"""Idempotent fictional demo seed for local development only. Never auto-run in HML/prod."""

from __future__ import annotations

import argparse
from datetime import date, timedelta

from sqlalchemy import select

from app.db import SessionLocal
from app.models.client import Client
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.service import Service
from app.models.user import User
from app.services.auth import register_owner
from app.services.domain import create_client, create_cycle, create_service

DEMO_EMAIL = "demo.profissional@croniu.local"
DEMO_PASSWORD = "DemoSenhaForte1!"
DEMO_MARKER = "[DEMO-CRONIU]"


def run(*, force: bool = False) -> None:
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user, organization, _ = register_owner(
                db,
                email=DEMO_EMAIL,
                password=DEMO_PASSWORD,
                full_name="Profissional Demo",
                organization_name=f"Studio Demo {DEMO_MARKER}",
            )
            print(f"Conta demo criada: {DEMO_EMAIL} / (senha no README local)")
        else:
            membership = db.scalar(select(Membership).where(Membership.user_id == user.id))
            assert membership is not None
            organization = db.get(Organization, membership.organization_id)
            assert organization is not None
            print(f"Conta demo já existe: {DEMO_EMAIL}")

        existing_client = db.scalar(
            select(Client).where(
                Client.organization_id == organization.id,
                Client.full_name == f"Cliente Demo {DEMO_MARKER}",
            )
        )
        if existing_client and not force:
            print("Seed já aplicado (use --force para recriar ciclo/recebimento).")
            return

        if existing_client is None:
            client_row = create_client(
                db,
                organization_id=organization.id,
                full_name=f"Cliente Demo {DEMO_MARKER}",
                phone="11988887777",
                email="cliente.demo@croniu.local",
                notes=f"{DEMO_MARKER} dados fictícios",
            )
        else:
            client_row = existing_client

        service = db.scalar(
            select(Service).where(
                Service.organization_id == organization.id,
                Service.name == f"Plano Mensal {DEMO_MARKER}",
            )
        )
        if service is None:
            service = create_service(
                db,
                organization_id=organization.id,
                name=f"Plano Mensal {DEMO_MARKER}",
                description="Pacote fictício de demonstração",
                default_duration_days=30,
                default_price_cents=40000,
            )

        starts = date.today()
        create_cycle(
            db,
            organization_id=organization.id,
            client_id=client_row.id,
            service_id=service.id,
            starts_on=starts,
            ends_on=starts + timedelta(days=4),
            value_cents=40000,
            notes=f"{DEMO_MARKER} ciclo encerrando",
            create_receivable=True,
            receivable_due_on=starts,
        )
        print("Seed demo aplicado com ciclo encerrando e recebimento pendente.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed local fictício do Croniu (idempotente).")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    run(force=args.force)


if __name__ == "__main__":
    main()
