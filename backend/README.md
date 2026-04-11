# UrbanPulse Backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

Set `JWT_SECRET` in your local environment. No shared proxy token is needed.

Database tooling:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

`DATABASE_URL` is required for the Drizzle ORM setup.
