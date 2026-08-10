"""CLI: create platform administrator securely (no default password, no seed)."""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models.platform_membership import PlatformMembership
from app.models.user import User
from app.security.passwords import hash_password
from app.services.platform_auth import PLATFORM_ROLES


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Bootstrap ou promove um administrador da plataforma Croniu."
    )
    parser.add_argument("--email", default=os.environ.get("PLATFORM_ADMIN_EMAIL"))
    parser.add_argument("--full-name", default=os.environ.get("PLATFORM_ADMIN_FULL_NAME"))
    parser.add_argument(
        "--role",
        default=os.environ.get("PLATFORM_ADMIN_ROLE", "platform_admin"),
        choices=sorted(PLATFORM_ROLES),
    )
    parser.add_argument(
        "--password-env",
        default="PLATFORM_ADMIN_PASSWORD",
        help="Nome da variável de ambiente com a senha (nunca versionar).",
    )
    args = parser.parse_args(argv)

    email = (args.email or input("E-mail do administrador: ")).strip().lower()
    full_name = (args.full_name or input("Nome completo: ")).strip()
    if not email or not full_name:
        print("E-mail e nome são obrigatórios.", file=sys.stderr)
        return 1

    password = os.environ.get(args.password_env)
    if not password:
        password = getpass.getpass("Senha (não ecoada): ")
        confirm = getpass.getpass("Confirme a senha: ")
        if password != confirm:
            print("Senhas não conferem.", file=sys.stderr)
            return 1
    if len(password) < 12:
        print("Senha deve ter pelo menos 12 caracteres.", file=sys.stderr)
        return 1

    get_settings.cache_clear()
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                full_name=full_name,
                password_hash=hash_password(password),
                account_status="active",
            )
            db.add(user)
            db.flush()
            print(f"Usuário criado: {email}")
        else:
            user.full_name = full_name
            user.password_hash = hash_password(password)
            user.account_status = "active"
            db.add(user)
            print(f"Usuário existente atualizado: {email}")

        membership = db.scalar(
            select(PlatformMembership).where(PlatformMembership.user_id == user.id)
        )
        if membership is None:
            membership = PlatformMembership(user_id=user.id, role=args.role)
            db.add(membership)
            print(f"Membership de plataforma criada: {args.role}")
        else:
            membership.role = args.role
            db.add(membership)
            print(f"Membership de plataforma atualizada: {args.role}")

        db.commit()
        print("OK — administrador da plataforma pronto. Não compartilhe a senha.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
