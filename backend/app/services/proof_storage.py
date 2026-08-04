"""Local filesystem storage for payment proof images (not web-public)."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from pathlib import Path

from app.config import get_settings
from app.services.auth import AuthError

ALLOWED_MIME = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
}
# WebP: RIFF....WEBP
MAX_BYTES_DEFAULT = 5_242_880


def _storage_root() -> Path:
    settings = get_settings()
    root = Path(settings.proof_storage_dir)
    if not root.is_absolute():
        # Resolve relative to backend package parent (repo backend/)
        root = Path(__file__).resolve().parents[2] / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def detect_mime(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    return None


def store_proof_bytes(
    *,
    organization_id: uuid.UUID,
    data: bytes,
    declared_mime: str | None,
) -> tuple[str, str, int, str]:
    settings = get_settings()
    max_bytes = settings.max_proof_bytes or MAX_BYTES_DEFAULT
    if len(data) == 0 or len(data) > max_bytes:
        raise AuthError("proof_too_large", "O comprovante deve ter no máximo 5 MB.", 413)
    mime = detect_mime(data)
    if mime is None:
        raise AuthError(
            "proof_invalid",
            "Arquivo inválido. Envie PDF, JPEG ou PNG.",
            422,
        )
    if declared_mime and declared_mime != mime:
        raise AuthError("proof_mime_mismatch", "Tipo de arquivo inconsistente.", 422)
    digest = hashlib.sha256(data).hexdigest()
    ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf",
    }[mime]
    key = f"{organization_id}/{secrets.token_urlsafe(24)}.{ext}"
    path = _storage_root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key, mime, len(data), digest


def read_proof_bytes(storage_key: str) -> bytes:
    if ".." in storage_key or storage_key.startswith(("/", "\\")):
        raise AuthError("proof_not_found", "Comprovante não encontrado.", 404)
    path = _storage_root() / storage_key
    if not path.is_file():
        raise AuthError("proof_not_found", "Comprovante não encontrado.", 404)
    return path.read_bytes()


def delete_proof_file(storage_key: str) -> None:
    if ".." in storage_key or storage_key.startswith(("/", "\\")):
        return
    path = _storage_root() / storage_key
    if path.is_file():
        path.unlink(missing_ok=True)
