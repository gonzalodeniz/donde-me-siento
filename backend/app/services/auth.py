"""Casos de uso de autenticacion."""

from __future__ import annotations

from dataclasses import dataclass
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


@dataclass(frozen=True, slots=True)
class LoginIdentity:
    """Par usuario-contrasena permitido por el sistema."""

    username: str
    password: str


class AuthService:
    """Gestiona login, sesion y usuario autenticado."""

    VALID_IDENTITIES = (
        LoginIdentity(username="raquel", password="héctor"),
        LoginIdentity(username="héctor", password="raquel"),
    )

    def __init__(self, user_repository: UserRepository, session_repository: SessionRepository) -> None:
        self.user_repository = user_repository
        self.session_repository = session_repository

    def ensure_pair_users(self) -> list[AuthUser]:
        users: list[AuthUser] = []
        for identity in self.VALID_IDENTITIES:
            existing_user = self.user_repository.get_by_username(identity.username)
            salt = generate_salt()
            user = AuthUser(
                id=existing_user.id if existing_user is not None else f"user-{uuid4().hex[:12]}",
                username=identity.username,
                password_hash=hash_password(identity.password, salt),
                password_salt=salt,
            )
            users.append(self.user_repository.save(user))
        return users

    def login(self, username: str, password: str) -> tuple[str, AuthUser]:
        if not self._is_valid_identity(username, password):
            raise AuthenticationError("Credenciales invalidas")

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

    @classmethod
    def _is_valid_identity(cls, username: str, password: str) -> bool:
        return any(identity.username == username and identity.password == password for identity in cls.VALID_IDENTITIES)
