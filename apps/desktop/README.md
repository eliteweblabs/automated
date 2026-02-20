# Desktop App (Electron)

This repository now includes an Electron wrapper that runs:

- NestJS backend from `dist/apps/backend/main.js`
- Next.js frontend via `next start apps/frontend`

## Commands

- `npm run desktop:dev`
  - Starts backend + frontend in dev mode, then opens Electron.
- `npm run desktop:build`
  - Builds production backend + frontend assets.
- `npm run desktop:dist:mac`
  - Builds the app and creates a macOS `.dmg` in `dist/desktop`.
- `npm run desktop:dist:dir`
  - Builds an unpacked macOS app directory in `dist/desktop`.

## Runtime Notes

- Default ports:
  - Frontend: `3000`
  - Backend: `8080`
- You can override with:
  - `FRONTEND_PORT`
  - `BACKEND_PORT`
- In packaged mode, backend runtime writes go to Electron `userData` (logs, recordings, local browser contexts).
