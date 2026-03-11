"""Tests unitarios de utilidades de seguridad."""

from __future__ import annotations

from backend.app.core.security import (
    generate_salt,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


def test_password_hashing_and_verification() -> None:
    salt = generate_salt()
    password_hash = hash_password("secreto", salt)

    assert verify_password("secreto", salt, password_hash) is True
    assert verify_password("otro", salt, password_hash) is False


def test_session_tokens_are_hashed_deterministically() -> None:
    token = generate_session_token()

    assert hash_session_token(token) == hash_session_token(token)
    assert hash_session_token(token) != hash_session_token(generate_session_token())
