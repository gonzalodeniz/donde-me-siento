PYTHON ?= python
PIP ?= pip
VENV_BIN ?= .venv/bin
PYTEST ?= $(VENV_BIN)/pytest
UVICORN ?= $(VENV_BIN)/uvicorn

.PHONY: help install test test-cov run-backend lint clean

help:
	@printf "Objetivos disponibles:\n"
	@printf "  make install      Instala dependencias en el entorno virtual actual.\n"
	@printf "  make test         Ejecuta los tests unitarios.\n"
	@printf "  make test-cov     Ejecuta los tests con cobertura.\n"
	@printf "  make run-backend  Arranca la API FastAPI prevista para Fase 1.\n"
	@printf "  make clean        Limpia caches de Python y pytest.\n"

install:
	$(PIP) install -r requirements.txt

test:
	$(PYTEST)

test-cov:
	$(PYTEST) --cov=backend/app --cov-report=term-missing

run-backend:
	$(UVICORN) backend.app.main:app --reload

clean:
	find . -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".coverage" \) -prune -exec rm -rf {} +
