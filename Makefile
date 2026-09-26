.PHONY: dev test check gen-api

dev:        ## Run database, mail catcher, API and web app
	./scripts/dev.sh

test:       ## Backend test suite (needs `docker compose up -d`)
	cd backend && uv run pytest -q

check:      ## Lint, type-check and build everything
	cd backend && uv run ruff check src tests && uv run mypy src
	cd frontend && npx tsc -b && npx oxlint src && npm run build

gen-api:    ## Regenerate the typed frontend API client from the backend schema
	cd frontend && npm run gen:api
