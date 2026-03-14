PYTHON ?= python
PIP ?= pip
VENV_BIN ?= .venv/bin
PYTEST ?= $(VENV_BIN)/pytest
UVICORN ?= $(VENV_BIN)/uvicorn
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 5173
API_PROXY_TARGET ?= http://127.0.0.1:$(BACKEND_PORT)
DOCKER_IMAGE ?= donde-me-siento:latest
DOCKER_CONTAINER ?= donde-me-siento
DOCKER_PORT ?= 8080
DOCKER_DATA_DIR ?= $(CURDIR)/data

.PHONY: help install test test-cov run-backend install-frontend run-frontend run-app build-frontend test-e2e install-e2e docker-build docker-run docker-stop lint clean

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
	@printf "  make docker-build      Construye la imagen Docker de produccion.\n"
	@printf "  make docker-run        Arranca el contenedor publicando el puerto $(DOCKER_PORT).\n"
	@printf "  make docker-stop       Detiene el contenedor Docker si existe.\n"
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
	$(UVICORN) backend.app.main:app --reload --port $(BACKEND_PORT)

install-frontend:
	cd frontend && npm install

run-frontend:
	cd frontend && VITE_API_PROXY_TARGET=$(API_PROXY_TARGET) npm run dev -- --port $(FRONTEND_PORT)

run-app:
	@trap 'kill 0' INT TERM EXIT; \
	backend_pid=$$(lsof -tiTCP:$(BACKEND_PORT) -sTCP:LISTEN || true); \
	if [ -n "$$backend_pid" ]; then \
		backend_cmd=$$(ps -p $$backend_pid -o args= || true); \
		case "$$backend_cmd" in \
			*".venv/bin/uvicorn backend.app.main:app --reload"*) \
				printf "Cerrando backend previo del proyecto en el puerto $(BACKEND_PORT) (PID %s)\n" "$$backend_pid"; \
				kill $$backend_pid; \
				sleep 1; \
				if kill -0 $$backend_pid 2>/dev/null; then \
					printf "Forzando cierre del backend previo (PID %s)\n" "$$backend_pid"; \
					kill -9 $$backend_pid; \
					sleep 1; \
				fi; \
				;; \
			*) \
				printf "El puerto $(BACKEND_PORT) ya esta en uso por otro proceso:\n%s\n" "$$backend_cmd"; \
				exit 1; \
				;; \
		esac; \
	fi; \
	frontend_pid=$$(lsof -tiTCP:$(FRONTEND_PORT) -sTCP:LISTEN || true); \
	if [ -n "$$frontend_pid" ]; then \
		frontend_cmd=$$(ps -p $$frontend_pid -o args= || true); \
		case "$$frontend_cmd" in \
			*"$(CURDIR)/frontend/node_modules/.bin/vite"*) \
				printf "Cerrando frontend previo del proyecto en el puerto $(FRONTEND_PORT) (PID %s)\n" "$$frontend_pid"; \
				kill $$frontend_pid; \
				sleep 1; \
				if kill -0 $$frontend_pid 2>/dev/null; then \
					printf "Forzando cierre del frontend previo (PID %s)\n" "$$frontend_pid"; \
					kill -9 $$frontend_pid; \
					sleep 1; \
				fi; \
				;; \
			*) \
				printf "El puerto $(FRONTEND_PORT) ya esta en uso por otro proceso:\n%s\n" "$$frontend_cmd"; \
				exit 1; \
				;; \
		esac; \
	fi; \
	$(UVICORN) backend.app.main:app --reload --port $(BACKEND_PORT) & \
	cd frontend && VITE_API_PROXY_TARGET=$(API_PROXY_TARGET) npm run dev -- --port $(FRONTEND_PORT) & \
	wait

build-frontend:
	cd frontend && npm run build

docker-build:
	docker build -t $(DOCKER_IMAGE) .

docker-run:
	mkdir -p $(DOCKER_DATA_DIR)
	docker run --rm \
		--name $(DOCKER_CONTAINER) \
		-p $(DOCKER_PORT):80 \
		-v $(DOCKER_DATA_DIR):/app/data \
		$(DOCKER_IMAGE)

docker-stop:
	-docker stop $(DOCKER_CONTAINER)

install-e2e:
	cd frontend && npx playwright install chromium

test-e2e:
	cd frontend && npm run test:e2e

clean:
	find . -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".coverage" \) -prune -exec rm -rf {} +
