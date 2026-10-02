# Docker

Local services for development.

```bash
docker compose -f docker/docker-compose.yml up -d    # start Postgres + pgweb
docker compose -f docker/docker-compose.yml down     # stop (data is kept)
```

Postgres: `DATABASE_URL=postgresql://pabbar:pabbar@localhost:5433/pabbar`

pgweb (database UI): http://localhost:8081
