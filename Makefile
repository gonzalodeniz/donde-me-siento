PYTHON ?= python
PIP ?= pip
VENV_BIN ?= .venv/bin
PYTEST ?= $(VENV_BIN)/pytest
UVICORN ?= $(VENV_BIN)/uvicorn

.PHONY: help install test test-cov run-backend install-frontend run-frontend run-app build-frontend test-e2e install-e2e lint clean

help:
	@printf "Objetivos disponibles:\n"
	@printf "  make install      Instala dependencias en el entorno virtual actual.\n"
	@printf "  make test         Ejecuta los tests unitarios.\n"
	@printf "  make test-cov     Ejecuta los tests con cobertura.\n"
	@printf "  make run-backend  Arranca la API FastAPI prevista para Fase 1.\n"
	@printf "  make install-frontend  Instala dependencias del frontend.\n"
	@printf "  make run-frontend      Arranca Vite en modo desarrollo.\n"
	@printf "  make run-app           Arranca backend y frontend a la vez.\n"
	@printf "  make build-frontend    Genera la build del frontend.\n"
	@printf "  make install-e2e       Instala navegadores de Playwright.\n"
	@printf "  make test-e2e          Ejecuta el flujo E2E minimo.\n"
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

run-app:
	@trap 'kill 0' INT TERM EXIT; \
	$(UVICORN) backend.app.main:app --reload & \
	cd frontend && npm run dev & \
	wait

build-frontend:
	cd frontend && npm run build

install-e2e:
	cd frontend && npx playwright install chromium

test-e2e:
	cd frontend && npm run test:e2e

clean:
	find . -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".coverage" \) -prune -exec rm -rf {} +
