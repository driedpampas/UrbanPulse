# Agent Rules

- If `bun` is not found on the system `PATH`, use `~/.bun/bin/bun` as the executable path.
- In JS and TS projects, use `bun` all the time, unless there is no `bun.lock` file.
- **Backend**: Run with `bun run app` and ensure `backend/.env` has all required variables.
- **Frontend**: Built with Vite + Preact + Tailwind CSS. Run `bun run dev` for local development.

## Code Style & Quality

- **Consistency**: Follow the current code style and design patterns. Keep code correct, structured, and clean.
- **Backend**: Use direct SQL via `postgres` client (no ORM). Maintain the `ensureSchema()` pattern for database modules. Use explicit TypeScript types.
- **Frontend**: Use Preact functional components and hooks. Avoid inline styles; use the design system classes and CSS variables.

## Database & Migrations

- **Stack**: PostgreSQL + PostGIS.
- **ORM Usage**: No ORM is used. Database interaction is handled via a direct `postgres` client (see `backend/db/client.ts`).
- **Schema Management**: Structural changes should be implemented in `backend/db/schema.ts` inside `ensureSchema()` using `IF NOT EXISTS`.
- **Manual Migrations**: New changes should also be placed in `backend/migrations/` using `XXX_description.sql` (e.g., `006_new_feature.sql`).

## Verification & Finishing

- **Linting**: Before finishing, run `bun x @biomejs/biome check --write <changed_files>` to ensure code follows the project's formatting and linting rules.
- **Type Safety**: Run `tsc --noEmit` in the respective directory (`backend/` or `frontend/`) for any changed files to ensure no type errors.
- **Build Check**: Always run `bun run build` in `frontend/` to ensure the production bundle builds successfully.
- **Fix Issues**: All problems found during verification MUST be resolved before the task is considered complete.

## Project Structure

- **Backend**: `./backend/`. Entry point is `index.ts`. Logic in `db/` and `routes/`.
- **Frontend**: `./frontend/`. Design system in `index.css`.
- **Auth Mailer**: `./auth-mailer/` (Cloudflare Worker).

## UI & Theme Rules

The project uses a centralized design system in `frontend/src/index.css`. **Avoid inline styles.** Use the following classes:

- **Layout**: `.page-shell`, `.app-container`, `.stack-v`, `.stack-h`, `.flex-between`, `.flex-center`, `.gap-sm` (8px), `.gap-md` (12px), `.gap-lg` (16px).
- **Surface**: `.section`, `.section-header`, `.section-body`, `.card`, `.card-raised`, `.header-bar`, `.nav-bar`.
- **Typography**: `.label-caps` (for section labels).
- **Controls**: `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.input-field`, `.tab-switcher`, `.tab-btn`, `.range-slider`.
- **Media**: `.avatar`, `.avatar-sm`, `.avatar-lg`.
- **Feedback**: `.type-badge`.
- **Overlays**: `.modal-overlay`, `.modal-content`, `.sheet-overlay`, `.sheet-content`.

**Design Tokens (CSS Variables):**

- Colors: `var(--accent)`, `var(--bg)`, `var(--text)`, `var(--border)`, `var(--surface)`.
- Status: `var(--success)`, `var(--warning)`, `var(--danger)`.
- Shadows: `var(--shadow-sm)`, `var(--shadow)`, `var(--shadow-md)`, `var(--shadow-lg)`.

Always use `var(--var-name)` for colors to ensure Dark Mode compatibility.
