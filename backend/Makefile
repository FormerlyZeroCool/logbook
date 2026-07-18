.PHONY: up down logs build migrate test backup restore

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api db

build:
	docker compose build

migrate:
	docker compose run --rm api node dist/db/migrate.js

test:
	npm test

backup:
	./scripts/backup.sh
