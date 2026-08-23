"""Google Identity Services (OIDC) sign-in/sign-up.

Contract for this module, matching app.services.auth for the password path:

- The Google ID token (`credential`) is validated exclusively here, in the
  backend, using Google's own client library. The frontend never decides who
  the user is — it only forwards an opaque, signed token.
- `provider_subject` (Google's `sub` claim) is the only stable identifier
  for "who is this". E-mail is never used as the join key for an *existing*
  Google identity — only to look up a possible pre-existing Croniu account
  the first time that Google subject is seen.
- Account linking to a pre-existing password account only happens
  automatically when both sides already proved e-mail ownership (Google's
  `email_verified` claim AND Croniu's own `email_verified_at`). Otherwise the
  caller must prove ownership with the Croniu password via
  `link_google_identity_with_password`.
- Session creation, e-mail-verification gating and disabled-organization
  gating reuse the exact same functions as password login
  (create_session / ensure_email_verified / ensure_organization_not_disabled)
  — there is no parallel session mechanism for Google.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.user import User
from app.models.user_auth_identity import UserAuthIdentity
from app.services.auth import (
    AuthError,
    authenticate_user,
    ensure_email_verified,
    ensure_organization_not_disabled,
    primary_organization_id,
    register_owner,
)

logger = logging.getLogger(__name__)

GOOGLE_PROVIDER = "google"
_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


@dataclass
class GoogleIdentityClaims:
    subject: str
    email: str
    email_verified: bool
    name: str | None
    picture: str | None


@dataclass
class GoogleAuthResult:
    user: User
    organization: Organization
    membership: Membership
    is_new_user: bool
    linked_now: bool
    requires_email_verification: bool


def verify_google_id_token(credential: str, settings: Settings) -> GoogleIdentityClaims:
    """Validate signature, issuer, audience and expiry of a Google ID token.

    Never logs the credential itself. Raises AuthError with a generic public
    message on any failure — the caller must not distinguish "expired" from
    "forged" from "wrong audience" in the HTTP response, to avoid leaking
    validation internals.
    """
    if not settings.google_oauth_client_id:
        raise AuthError(
            "google_oauth_not_configured",
            "Login com Google não está disponível.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        claims = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            audience=settings.google_oauth_client_id,
        )
    except ValueError:
        # Covers: bad signature, expired token, audience mismatch, malformed
        # JWT — google-auth raises plain ValueError for all of these.
        raise AuthError(
            "invalid_google_token",
            "Não foi possível validar sua conta Google.",
            status.HTTP_401_UNAUTHORIZED,
        ) from None

    issuer = claims.get("iss")
    if issuer not in _GOOGLE_ISSUERS:
        raise AuthError(
            "invalid_google_token",
            "Não foi possível validar sua conta Google.",
            status.HTTP_401_UNAUTHORIZED,
        )

    subject = claims.get("sub")
    email = claims.get("email")
    if not subject or not email:
        raise AuthError(
            "invalid_google_token",
            "Não foi possível validar sua conta Google.",
            status.HTTP_401_UNAUTHORIZED,
        )

    return GoogleIdentityClaims(
        subject=str(subject),
        email=str(email).strip().lower(),
        email_verified=bool(claims.get("email_verified", False)),
        name=(str(claims["name"]).strip()[:200] if claims.get("name") else None),
        picture=(str(claims["picture"])[:500] if claims.get("picture") else None),
    )


def _finalize(
    db: Session,
    *,
    user: User,
    is_new_user: bool,
    linked_now: bool,
    requires_email_verification: bool,
) -> GoogleAuthResult:
    organization_id = primary_organization_id(db, user)
    organization = db.get(Organization, organization_id)
    ensure_organization_not_disabled(organization)
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.organization_id == organization_id,
        )
    )
    if organization is None or membership is None:
        raise AuthError(
            "no_organization", "Usuário sem organização.", status.HTTP_400_BAD_REQUEST
        )
    return GoogleAuthResult(
        user=user,
        organization=organization,
        membership=membership,
        is_new_user=is_new_user,
        linked_now=linked_now,
        requires_email_verification=requires_email_verification,
    )


def authenticate_with_google(
    db: Session,
    *,
    credential: str,
    settings: Settings,
) -> GoogleAuthResult:
    claims = verify_google_id_token(credential, settings)

    identity = db.scalar(
        select(UserAuthIdentity).where(
            UserAuthIdentity.provider == GOOGLE_PROVIDER,
            UserAuthIdentity.provider_subject == claims.subject,
        )
    )

    if identity is not None:
        user = db.get(User, identity.user_id)
        if user is None:
            raise AuthError(
                "invalid_session", "Conta não encontrada.", status.HTTP_401_UNAUTHORIZED
            )
        identity.email = claims.email
        identity.email_verified = claims.email_verified
        identity.display_name = claims.name
        identity.avatar_url = claims.picture
        identity.last_used_at = datetime.now(UTC)
        db.add(identity)
        db.commit()
        logger.info("google_auth_success user_id=%s is_new_user=False", user.id)
        ensure_email_verified(user, settings)
        return _finalize(
            db, user=user, is_new_user=False, linked_now=False, requires_email_verification=False
        )

    existing_user = db.scalar(select(User).where(User.email == claims.email))

    if existing_user is not None:
        both_sides_verified = claims.email_verified and existing_user.email_verified_at is not None
        if not both_sides_verified:
            logger.info("google_link_required user_id=%s", existing_user.id)
            raise AuthError(
                "google_link_required",
                "Já existe uma conta com este e-mail. Entre com sua senha para conectar o Google.",
                status.HTTP_409_CONFLICT,
            )
        user = existing_user
        _attach_identity(db, user=user, claims=claims)
        logger.info("google_account_linked user_id=%s", user.id)
        ensure_email_verified(user, settings)
        return _finalize(
            db, user=user, is_new_user=False, linked_now=True, requires_email_verification=False
        )

    # Brand-new account. Reuses the exact same user/org/membership/trial
    # creation as the password path (register_owner) — no parallel signup
    # logic, no profession guess from the e-mail domain.
    full_name = (claims.name or claims.email.split("@")[0]).strip()[:200] or "Profissional"
    try:
        user, organization, membership = register_owner(
            db,
            email=claims.email,
            password=None,
            full_name=full_name,
            organization_name=full_name,
            skip_email_verification_dispatch=claims.email_verified,
        )
    except AuthError as exc:
        if exc.code == "email_taken":
            # Lost a race against a concurrent registration for this e-mail
            # between our lookup above and register_owner's own check.
            raise AuthError(
                "google_link_required",
                "Já existe uma conta com este e-mail. Entre com sua senha para conectar o Google.",
                status.HTTP_409_CONFLICT,
            ) from exc
        raise

    if claims.email_verified:
        user.email_verified_at = datetime.now(UTC)
        db.add(user)
        db.commit()
        db.refresh(user)

    _attach_identity(db, user=user, claims=claims)
    logger.info("google_auth_success user_id=%s is_new_user=True", user.id)

    requires_email_verification = (
        settings.email_verification_required and user.email_verified_at is None
    )
    return _finalize(
        db,
        user=user,
        is_new_user=True,
        linked_now=False,
        requires_email_verification=requires_email_verification,
    )


def link_google_identity_with_password(
    db: Session,
    *,
    credential: str,
    password: str,
    settings: Settings,
) -> GoogleAuthResult:
    """Cenário C, explicit-confirmation path: prove ownership with the
    existing Croniu password, then attach the Google identity to that same
    account. Never called implicitly — only from a dedicated endpoint the
    frontend hits after the user types their password in response to a
    `google_link_required` error."""
    claims = verify_google_id_token(credential, settings)
    user = authenticate_user(db, email=claims.email, password=password)

    conflicting = db.scalar(
        select(UserAuthIdentity).where(
            UserAuthIdentity.provider == GOOGLE_PROVIDER,
            UserAuthIdentity.provider_subject == claims.subject,
        )
    )
    if conflicting is not None and conflicting.user_id != user.id:
        raise AuthError(
            "google_identity_conflict",
            "Esta conta Google já está conectada a outro usuário.",
            status.HTTP_409_CONFLICT,
        )
    if conflicting is None:
        _attach_identity(db, user=user, claims=claims)
    else:
        conflicting.last_used_at = datetime.now(UTC)
        db.add(conflicting)
        db.commit()

    logger.info("google_account_linked user_id=%s", user.id)
    ensure_email_verified(user, settings)
    return _finalize(
        db, user=user, is_new_user=False, linked_now=True, requires_email_verification=False
    )


def _attach_identity(db: Session, *, user: User, claims: GoogleIdentityClaims) -> UserAuthIdentity:
    identity = UserAuthIdentity(
        id=uuid.uuid4(),
        user_id=user.id,
        provider=GOOGLE_PROVIDER,
        provider_subject=claims.subject,
        email=claims.email,
        email_verified=claims.email_verified,
        display_name=claims.name,
        avatar_url=claims.picture,
        last_used_at=datetime.now(UTC),
    )
    db.add(identity)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Unique (provider, provider_subject) tripped by a concurrent
        # request for the same Google account — not a real conflict for the
        # caller, just a lost race. Surface a retryable, generic error.
        raise AuthError(
            "google_link_required",
            "Não foi possível conectar sua conta Google agora. Tente novamente.",
            status.HTTP_409_CONFLICT,
        ) from exc
    return identity
