# pabbar

NestJS API + Next.js app + Docker dev services, started with one command.

**Stack:** NestJS · Next.js 16 · React 19 · Postgres 17 · Redis 7 · Prisma 7 · TypeScript

## Navigate by goal

| I want to… | Go to |
| --- | --- |
| Get it running for the first time | [Quick start](#quick-start) |
| Run only the frontend or backend | [Run modes](#run-modes) |
| Change ports, secrets, login providers | [Configuration](#configuration) |
| Understand how the pieces fit | [Architecture](#architecture) |
| Know how login and sessions work | [Authentication](#authentication) |
| Call an endpoint | [API](#api) |
| Find where code lives | [Project structure](#project-structure) |
| Fix something broken | [Troubleshooting](#troubleshooting) |

## Quick start

**Prerequisites:** Node.js 22+, npm, Docker (with Compose v2).

```bash
npm run install:all                      # root + backend + frontend
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env.local
npm run dev                              # Docker, then backend + frontend
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:4710 |
| Backend API | http://localhost:4711 |
| pgweb (DB UI) | http://localhost:4714 |
| Mailpit (email inbox) | http://localhost:4715 |

**Local login:** social login is off by default. Enter any email on `/login`, then read the 6-digit code in Mailpit.

`Ctrl+C` stops the apps; containers keep running. Stop them with `npm run docker:down`.

## Run modes

| Mode | Command | Docker | Backend | Frontend | Use when |
| --- | --- | :-: | :-: | :-: | --- |
| Everything | `npm run dev` | ✅ | ✅ | ✅ | Day-to-day work |
| Backend only | `npm run dev:be` | ✅ | ✅ | ❌ | API work |
| Frontend only | `npm run dev:fe` | ❌ | ❌ | ✅ | UI work against a running API |
| Apps, no Docker | `npm run dev:apps` | ❌ | ✅ | ✅ | You bring your own Postgres/Redis/SMTP |

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run docker:up` / `docker:down` | Start (and wait for health) / stop containers, data kept |
| `npm run docker:logs` | Tail container logs |
| `npm run docker:reset` | Stop containers and **delete** data volumes |
| `npm run build` | Build backend, then frontend |
| `npm run lint` | oxlint (backend) + eslint (frontend) |
| `npm run test` | Backend unit tests (Vitest) |

Backend extras (from `backend/`): `test:watch`, `test:cov`, `test:e2e`, `format`.

## Configuration

Copy the `.env.example` files (see Quick start); defaults work locally. Main variables:

| Variable | Where | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | backend | `postgresql://pabbar:pabbar@localhost:4712/pabbar` | Required |
| `REDIS_URL` | backend | unset | Optional in dev, **required in production** |
| `PORT` | backend | `4711` | |
| `FRONTEND_URL` | backend | `http://localhost:4710` | CORS origin |
| `SMTP_HOST` / `SMTP_PORT` | backend | `localhost` / `4716` | Mailpit in dev; real provider in production |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` / `SMTP_FROM` | backend | | Real provider only |
| `SESSION_TTL_DAYS` / `SESSION_REMEMBER_TTL_DAYS` | backend | `1` / `30` | |
| `AUTH_GOOGLE_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | backend | off | Enables Google login |
| `AUTH_GITHUB_ENABLED`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | backend | off | Enables GitHub login |
| `UPLOADS_DIR` | backend | | Avatar storage directory |
| `BACKEND_URL` | frontend | `http://localhost:4711` | Where the frontend reaches the API |
| `ASSETS_BASE_URL` | frontend | `BACKEND_URL` | Base URL for uploaded images |

Ports: frontend 4710, backend 4711, Postgres 4712, Redis 4713, pgweb 4714, Mailpit UI 4715, Mailpit SMTP 4716. Docker services bind to `127.0.0.1` only; see [docker/README.md](docker/README.md).

## Architecture

```mermaid
flowchart TB
    U(["Browser"]) --> FE

    subgraph FE["Frontend · Next.js · :4710"]
      PX["proxy.ts<br/>cookie gate"] --> PG["App Router pages"] --> LIB["lib/api.ts · lib/session.ts"]
    end

    LIB -- "HTTP + cookie pabbar_session" --> BE

    subgraph BE["Backend · NestJS · :4711"]
      CTL["AuthController /auth/*"] --> SG["SessionGuard"]
      CTL --> OTP["OtpService"] --> MAIL["MailService"]
      CTL --> OA["OAuth Google/GitHub"]
      CTL --> USR["UsersService + StorageService"]
    end

    BE --> PGDB[("Postgres")]
    BE -. "session cache, rate limits" .-> RD[("Redis")]
    MAIL -. "SMTP (dev)" .-> MP["Mailpit"]
```

Principles:

- **Stateless apps, stateful infra.** Sessions live in Postgres (cached in Redis) and rate-limit counters in Redis, so you can run N backend replicas.
- **Redis is optional in dev, required in production.** Without `REDIS_URL` the backend uses in-memory rate limiting and no session cache (single instance only) and logs a warning.
- **No plain-text secrets.** Session tokens and OTP codes are stored only as hashes.
- **Cheap edge check, real check on the server.** `proxy.ts` only checks that the session cookie exists; `SessionGuard` validates it.

## Authentication

**Email one-time code**

```mermaid
sequenceDiagram
    actor U as User
    participant W as Frontend
    participant A as Backend
    U->>W: enter email
    W->>A: POST /auth/otp/request
    A-->>U: 6-digit code by email (rate limited)
    U->>W: enter code
    W->>A: POST /auth/otp/verify
    A-->>W: Set-Cookie pabbar_session
    W-->>U: redirect /dashboard
```

Codes expire after 10 minutes, allow 5 attempts, and can be resent after 30 seconds.

**Social login (Google / GitHub):** `GET /auth/oauth/:provider` redirects to the provider; the callback links or creates the user and sets the session cookie.

**Every request:** `proxy.ts` redirects to `/login` if the cookie is missing. Otherwise `SessionGuard` checks the Redis cache, then Postgres (`hash(token)` valid and unexpired), else returns 401.

**Email change:** `POST /auth/me/email/request` sends a code to the new address; `POST /auth/me/email/verify` applies it. A code is valid only for its own purpose (`LOGIN` vs `EMAIL_CHANGE`) and, for email change, only for the requesting user.

**Data model** (source of truth: [backend/prisma/schema.prisma](backend/prisma/schema.prisma)):

| Table | Holds |
| --- | --- |
| `User` | Email, phone, name, avatar, date of birth, gender, status |
| `Identity` | Login methods per user (email, google, github, phone) |
| `Session` | Hashed token, expiry, user agent, IP, remember flag |
| `OtpChallenge` | Hashed code, purpose, attempts, expiry |

## API

All routes are under `/auth`. 🔒 = needs a valid session cookie.

| Method | Path | 🔒 | Purpose |
| --- | --- | :-: | --- |
| `GET` | `/auth/config` | | Enabled login methods |
| `POST` | `/auth/otp/request` | | Send login code |
| `POST` | `/auth/otp/verify` | | Verify code, start session |
| `GET` | `/auth/oauth/:provider` | | Begin social login |
| `GET` | `/auth/oauth/:provider/callback` | | Social login callback |
| `GET` / `PATCH` / `DELETE` | `/auth/me` | ✅ | Get / update profile / delete account |
| `POST` / `DELETE` | `/auth/me/avatar` | ✅ | Upload / remove avatar |
| `POST` | `/auth/me/email/request` | ✅ | Start email change |
| `POST` | `/auth/me/email/verify` | ✅ | Confirm email change |
| `GET` | `/auth/sessions` | ✅ | List your sessions |
| `DELETE` | `/auth/sessions/others` | ✅ | Sign out other devices |
| `POST` | `/auth/logout` | ✅ | Sign out |

Frontend routes: `/` and `/login` are public. `/dashboard` and `/settings` (`profile`, `security`, `appearance`) need the cookie.

## Project structure

```text
pabbar/
├── package.json            # root scripts (npm run dev, …)
├── docker/                 # docker-compose.yml: Postgres, Redis, pgweb, Mailpit
├── backend/                # NestJS API
│   ├── prisma/             # schema + migrations
│   └── src/
│       ├── auth/           # controller, otp/, oauth/, session/, account/, dto/
│       ├── users/          # user service, avatar processing
│       ├── mail/           # nodemailer wrapper
│       ├── storage/        # avatar storage (local; swappable)
│       ├── redis/          # client + throttler storage
│       └── prisma/         # PrismaService
└── frontend/               # Next.js app
    ├── app/                # (app)/ protected: dashboard, settings/*; login/; page.tsx
    ├── components/         # app, auth, landing, settings, theme, ui
    ├── lib/                # api client, session, theme helpers
    └── proxy.ts            # cookie gate
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Cannot connect to the Docker daemon | Start Docker (`sudo systemctl start docker` or Docker Desktop), rerun `npm run dev`. |
| Port already in use (4710–4716) | `lsof -i :4711` to find the owner. Stop it, or change `PORT` / the host port in `docker/docker-compose.yml` (and `DATABASE_URL` / `REDIS_URL` / `SMTP_PORT` to match). |
| Backend warns `REDIS_URL not set` | Fine locally. To match production, set `REDIS_URL=redis://localhost:4713` in `backend/.env`. |
| Database errors / schema out of date | From `backend/`: `npx prisma migrate dev`. For a clean slate: `npm run docker:reset && npm run docker:up`, then migrate (deletes local data). |
| Stuck redirecting to `/login` | Clear the `pabbar_session` cookie for localhost. |
| No login email arrives | Check Mailpit at http://localhost:4715 and that `SMTP_PORT=4716`. |
