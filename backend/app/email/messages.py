"""Transactional e-mail copy (PT-BR). Never log bodies or tokens."""

from __future__ import annotations

from urllib.parse import urlencode

from app.email.protocols import EmailMessage


def _app_link(base_url: str, path: str, *, token: str) -> str:
    root = base_url.rstrip("/")
    query = urlencode({"token": token})
    return f"{root}{path}?{query}"


def password_reset_email(
    *,
    to: str,
    token: str,
    app_public_url: str,
    reply_to: str | None,
    idempotency_key: str,
) -> EmailMessage:
    link = _app_link(app_public_url, "/reset-password", token=token)
    text = (
        "Recebemos um pedido para redefinir a senha da sua conta Croniu.\n\n"
        f"Abra este link em até 1 hora: {link}\n\n"
        "Se você não solicitou, ignore este e-mail."
    )
    html = (
        "<p>Recebemos um pedido para redefinir a senha da sua conta Croniu.</p>"
        f'<p><a href="{link}">Redefinir senha</a> (válido por 1 hora).</p>'
        "<p>Se você não solicitou, ignore este e-mail.</p>"
    )
    return EmailMessage(
        to=to,
        subject="Redefinição de senha — Croniu",
        text_body=text,
        html_body=html,
        reply_to=reply_to,
        idempotency_key=idempotency_key,
        tags=("password_reset",),
    )


def email_verification_email(
    *,
    to: str,
    token: str,
    app_public_url: str,
    reply_to: str | None,
    idempotency_key: str,
) -> EmailMessage:
    link = _app_link(app_public_url, "/verify-email", token=token)
    text = (
        "Confirme o e-mail da sua conta Croniu.\n\n"
        f"Abra este link em até 24 horas: {link}\n\n"
        "Se você não criou uma conta, ignore este e-mail."
    )
    html = (
        "<p>Confirme o e-mail da sua conta Croniu.</p>"
        f'<p><a href="{link}">Verificar e-mail</a> (válido por 24 horas).</p>'
        "<p>Se você não criou uma conta, ignore este e-mail.</p>"
    )
    return EmailMessage(
        to=to,
        subject="Confirme seu e-mail — Croniu",
        text_body=text,
        html_body=html,
        reply_to=reply_to,
        idempotency_key=idempotency_key,
        tags=("email_verification",),
    )


def welcome_email(
    *,
    to: str,
    full_name: str,
    app_public_url: str,
    reply_to: str | None,
    idempotency_key: str,
) -> EmailMessage:
    root = app_public_url.rstrip("/")
    text = (
        f"Olá, {full_name.strip() or 'profissional'}!\n\n"
        "Sua conta Croniu está pronta. Acesse: "
        f"{root}/login\n\n"
        "Confirme seu e-mail pelo link que enviamos em seguida."
    )
    html = (
        f"<p>Olá, {full_name.strip() or 'profissional'}!</p>"
        f'<p>Sua conta Croniu está pronta. <a href="{root}/login">Entrar</a></p>'
        "<p>Confirme seu e-mail pelo link enviado em seguida.</p>"
    )
    return EmailMessage(
        to=to,
        subject="Bem-vindo ao Croniu",
        text_body=text,
        html_body=html,
        reply_to=reply_to,
        idempotency_key=idempotency_key,
        tags=("welcome",),
    )
