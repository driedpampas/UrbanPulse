# Agent Rules

- If `bun` is not found on the system `PATH`, use `~/.bun/bin/bun` as the executable path.
- In JS and TS projects, use `bun` all the time, unless there is no `bun.lock` file.
- **Frontend**: Before finishing, run `bun run build` in `frontend/` to ensure builds succeed.
- **Backend**: Run with `bun run app` and ensure `backend/.env` has all required variables.

## Database & Migrations

- **Stack**: PostgreSQL + PostGIS.
- **ORM Usage**: No ORM is used. Database interaction is handled via a direct `postgres` client (see `backend/db/client.ts`).
- **Schema Management**: Structural changes (creating tables, adding columns/indexes) should be implemented in `backend/db/schema.ts` inside the `ensureSchema()` function using `IF NOT EXISTS` clauses.
- **Manual Migrations**: New database structural changes should be placed in `backend/migrations/` using the `XXX_description.sql` naming convention (e.g., `006_new_feature.sql`). Name migrations descriptively based on the changes they contain. These are currently manual and the source of truth for the schema logic should be mirrored in `ensureSchema()`.

## Project Structure

- **Backend**: Located in `./backend/`. Entry point is `index.ts`. Logic is modularized in `./backend/db/` and `routes/`.
- **Frontend**: Located in `./frontend/`. Built with Vite + Preact + Tailwind CSS. Design system is in `index.css`.
- **Auth Mailer**: Located in `./auth-mailer/` (Cloudflare Worker for emails).

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
