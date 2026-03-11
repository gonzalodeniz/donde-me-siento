"""Utilidades de seguridad para autenticacion basica."""

from __future__ import annotations

from hashlib import pbkdf2_hmac, sha256
import hmac
import secrets


def generate_salt() -> str:
    """Genera una sal aleatoria para el hash de contrasenas."""

    return secrets.token_hex(16)


def hash_password(password: str, salt: str) -> str:
    """Genera el hash de una contrasena con PBKDF2."""

    return pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    """Verifica una contrasena contra su hash esperado."""

    return hmac.compare_digest(hash_password(password, salt), expected_hash)


def generate_session_token() -> str:
    """Genera un token opaco para la sesion."""

    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """Hashea el token de sesion para no persistirlo en claro."""

    return sha256(token.encode("utf-8")).hexdigest()
