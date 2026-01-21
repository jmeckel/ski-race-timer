# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the main TypeScript app (`app.ts`, `main.ts`) plus feature modules, services, and UI components.
- `src/components/` uses `PascalCase` filenames (e.g., `Clock.ts`) for reusable UI pieces.
- `api/` contains Vercel serverless endpoints and auth/admin helpers.
- `public/` stores PWA assets (manifest, icons, service worker); `dist/` is the build output.
- `tests/` contains unit, API, and Playwright E2E suites; `docs/` and `README.md` cover product docs.

## Build, Test, and Development Commands
- `npm run dev` or `npm start`: run the Vite dev server at `http://localhost:3000`.
- `npm run build`: typecheck and build the production bundle.
- `npm run preview`: serve the built bundle locally.
- `npm run test`: run unit tests with Vitest.
- `npm run test:e2e`: run Playwright E2E tests (install browsers first with `npx playwright install`).
- `npm run test:all`: run unit + E2E suites.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; follow existing formatting in `src/`.
- TypeScript with ES modules; prefer `const` and explicit types where helpful.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/components, `kebab-case` for CLI flags or file paths in docs.
- Keep UI logic in `src/features/` and shared helpers in `src/utils/` to avoid monolith growth in `app.ts`.

## Testing Guidelines
- Frameworks: Vitest (unit/API) and Playwright (E2E); see `TESTING.md` for patterns.
- Test files live under `tests/` and use `*.test.js` or `*.spec.js` naming.
- Prefer adding unit tests for utilities and E2E coverage for user flows like timing, results, and settings.

## Commit & Pull Request Guidelines
- Commit messages in this repo are short, imperative, and start with a verb (e.g., `Fix ...`, `Add ...`, `Update ...`).
- PRs should include a concise summary, testing notes (`npm run test` / `npm run test:e2e`), and screenshots or recordings for UI changes.
- Link relevant issues and note any config changes (e.g., new env vars).

## Configuration & Security Notes
- Local config lives in `.env.local` (do not commit). Example: `REDIS_URL=redis://user:pass@host:port`.
- Keep race data handling aligned with existing validation and sanitization in `src/utils/validation`.
