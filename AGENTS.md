# Agent Rules

- If `bun` is not found on the system `PATH`, use `~/.bun/bin/bun` as the executable path.
- In JS and TS projects, use `bun` all the time, unless there is no `bun.lock` file.
- Before finishing and handing off, always run `bun run build` to ensure builds will succeed.

## UI & Theme Rules

The project uses a centralized design system in `frontend/src/index.css`. **Avoid inline styles.** Use the following classes:

- **Layout**: `.stack-v`, `.stack-h`, `.flex-between`, `.gap-sm` (8px), `.gap-md` (12px), `.gap-lg` (16px).
- **Surface**: `.section`, `.section-header`, `.section-body`, `.card`, `.card-raised`.
- **Typography**: `.label-caps` (for section labels).
- **Controls**: `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.input-field`, `.tab-switcher`, `.tab-btn`.
- **Media**: `.avatar`, `.avatar-sm`, `.avatar-lg`.
- **Feedback**: `.type-badge`.
- **Overlays**: `.modal-overlay`, `.modal-content`, `.sheet-overlay`, `.sheet-content`.

**Design Tokens (CSS Variables):**
- Colors: `var(--accent)`, `var(--bg)`, `var(--text)`, `var(--border)`, `var(--surface)`.
- Status: `var(--success)`, `var(--warning)`, `var(--danger)`.
- Shadows: `var(--shadow-sm)`, `var(--shadow)`, `var(--shadow-md)`, `var(--shadow-lg)`.

Always use `var(--var-name)` for colors to ensure Dark Mode compatibility.
