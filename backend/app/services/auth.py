"""Casos de uso de autenticacion."""

from __future__ import annotations

from uuid import uuid4

from backend.app.core.security import (
    generate_salt,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from backend.app.repositories.auth import AuthUser, SessionRepository, UserRepository


class AuthenticationError(ValueError):
    """Las credenciales o la sesion no son validas."""


class AuthService:
    """Gestiona login, sesion y usuario autenticado."""

    def __init__(self, user_repository: UserRepository, session_repository: SessionRepository) -> None:
        self.user_repository = user_repository
        self.session_repository = session_repository

    def ensure_default_user(self, username: str, password: str) -> AuthUser:
        existing_user = self.user_repository.get_by_username(username)
        if existing_user is not None:
            return existing_user

        salt = generate_salt()
        user = AuthUser(
            id=f"user-{uuid4().hex[:12]}",
            username=username,
            password_hash=hash_password(password, salt),
            password_salt=salt,
        )
        return self.user_repository.create(user)

    def login(self, username: str, password: str) -> tuple[str, AuthUser]:
        user = self.user_repository.get_by_username(username)
        if user is None or not verify_password(password, user.password_salt, user.password_hash):
            raise AuthenticationError("Credenciales invalidas")

        access_token = generate_session_token()
        self.session_repository.create(
            session_id=f"session-{uuid4().hex[:12]}",
            token_hash=hash_session_token(access_token),
            user_id=user.id,
        )
        return access_token, user

    def get_current_user(self, token: str) -> AuthUser:
        user = self.session_repository.get_user_by_token_hash(hash_session_token(token))
        if user is None:
            raise AuthenticationError("Sesion invalida")
        return user

    def logout(self, token: str) -> None:
        deleted = self.session_repository.delete_by_token_hash(hash_session_token(token))
        if not deleted:
            raise AuthenticationError("Sesion invalida")
