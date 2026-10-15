# Frontend

Next.js 16 (App Router) app on http://localhost:4710. It talks to the backend at `BACKEND_URL` (default `http://localhost:4711`).

Run it from the repo root (`npm run dev:fe` or `npm run dev`); see the [root README](../README.md) for setup and configuration.

```bash
npm run dev     # dev server
npm run lint    # eslint
npm run build   # production build
```

Layout: `app/` (public `/`, `/login`; protected `(app)/dashboard`, `(app)/settings/*`), `components/` (app, auth, landing, settings, theme, ui), `lib/` (API client, session), `proxy.ts` (session cookie gate).

This Next.js version has breaking changes; see [AGENTS.md](AGENTS.md) before writing code.
