# Docker

Local services for development: Postgres, Redis, pgweb, Mailpit. From the repo root:

```bash
npm run docker:up      # start and wait until healthy
npm run docker:down    # stop (data is kept)
npm run docker:reset   # stop and DELETE data volumes
```

`npm run dev` already runs `docker:up` for you.

Postgres: `DATABASE_URL=postgresql://pabbar:pabbar@localhost:4712/pabbar`

Redis: `REDIS_URL=redis://localhost:4713`

pgweb (database UI): http://localhost:4714

Mailpit (dev mail catcher): SMTP on `localhost:4716`, inbox UI at http://localhost:4715.
`backend/.env.example` already points `SMTP_*` at it, so login codes show up in the inbox with no email provider.
It is dev-only: nothing is delivered to real addresses. In production, point `SMTP_*` at a real provider.
