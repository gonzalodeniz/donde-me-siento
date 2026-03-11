PYTHON ?= python
PIP ?= pip
VENV_BIN ?= .venv/bin
PYTEST ?= $(VENV_BIN)/pytest
UVICORN ?= $(VENV_BIN)/uvicorn

.PHONY: help install test test-cov run-backend install-frontend run-frontend build-frontend lint clean

help:
	@printf "Objetivos disponibles:\n"
	@printf "  make install      Instala dependencias en el entorno virtual actual.\n"
	@printf "  make test         Ejecuta los tests unitarios.\n"
	@printf "  make test-cov     Ejecuta los tests con cobertura.\n"
	@printf "  make run-backend  Arranca la API FastAPI prevista para Fase 1.\n"
	@printf "  make install-frontend  Instala dependencias del frontend.\n"
	@printf "  make run-frontend      Arranca Vite en modo desarrollo.\n"
	@printf "  make build-frontend    Genera la build del frontend.\n"
	@printf "  make clean        Limpia caches de Python y pytest.\n"

install:
	$(PIP) install -r requirements.txt

test:
	$(PYTEST)

test-cov:
	$(PYTEST) --cov=backend/app --cov-report=term-missing

run-backend:
	$(UVICORN) backend.app.main:app --reload

install-frontend:
	cd frontend && npm install

run-frontend:
	cd frontend && npm run dev

build-frontend:
	cd frontend && npm run build

clean:
	find . -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".coverage" \) -prune -exec rm -rf {} +
