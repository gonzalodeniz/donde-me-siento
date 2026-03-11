"""Repositorios de usuarios y sesiones."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.models.auth import SessionModel, UserModel


@dataclass(slots=True)
class AuthUser:
    """Representacion de usuario autenticado en capa de servicio."""

    id: str
    username: str
    password_hash: str
    password_salt: str


class UserRepository:
    """Persistencia de usuarios."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_username(self, username: str) -> AuthUser | None:
        statement = select(UserModel).where(UserModel.username == username)
        model = self.session.scalar(statement)
        if model is None:
            return None
        return self._to_entity(model)

    def get_by_id(self, user_id: str) -> AuthUser | None:
        model = self.session.get(UserModel, user_id)
        if model is None:
            return None
        return self._to_entity(model)

    def create(self, user: AuthUser) -> AuthUser:
        model = UserModel(
            id=user.id,
            username=user.username,
            password_hash=user.password_hash,
            password_salt=user.password_salt,
        )
        self.session.add(model)
        self.session.commit()
        return self._to_entity(model)

    @staticmethod
    def _to_entity(model: UserModel) -> AuthUser:
        return AuthUser(
            id=model.id,
            username=model.username,
            password_hash=model.password_hash,
            password_salt=model.password_salt,
        )


class SessionRepository:
    """Persistencia de sesiones opacas."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, session_id: str, token_hash: str, user_id: str) -> None:
        model = SessionModel(id=session_id, token_hash=token_hash, user_id=user_id)
        self.session.add(model)
        self.session.commit()

    def get_user_by_token_hash(self, token_hash: str) -> AuthUser | None:
        statement = (
            select(SessionModel)
            .where(SessionModel.token_hash == token_hash)
            .options(selectinload(SessionModel.user))
        )
        model = self.session.scalar(statement)
        if model is None:
            return None
        return UserRepository._to_entity(model.user)

    def delete_by_token_hash(self, token_hash: str) -> bool:
        statement = select(SessionModel).where(SessionModel.token_hash == token_hash)
        model = self.session.scalar(statement)
        if model is None:
            return False
        self.session.delete(model)
        self.session.commit()
        return True
