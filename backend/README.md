# Backend

NestJS API (auth, users, sessions) on http://localhost:4711, backed by Postgres (Prisma) and Redis.

Run it from the repo root (`npm run dev:be` or `npm run dev`); see the [root README](../README.md) for setup, configuration and the API reference.

```bash
npm run start:dev   # watch mode
npm run test        # unit tests (Vitest)
npm run test:e2e    # e2e tests
npm run lint        # oxlint
npm run prisma:generate   # regenerate the client after install or schema changes
npx prisma migrate dev
```

Layout: `src/auth` (controller, otp, oauth, session), `src/users`, `src/mail`, `src/storage`, `src/redis`, `src/prisma`. Schema: `prisma/schema.prisma`.
