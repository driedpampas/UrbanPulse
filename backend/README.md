# UrbanPulse Backend

# How to run

## Environment Setup (backend/.env)

`JWT_SECRET` is required for password hashing.
`DATABASE_URL` is required for the PostgreSQL connection.
`AUTH_MAILER_URL` is required for email verification and password changing support.
`ORIGIN` is required for CORS integration with the frontend.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run app
```

## Database and Migrations

The database we decided to use is `PostgreSQL` together with the `PostGIS` extension.

**IMPORTANT**: The migrations are done manually, the folder you should place migrations is `backend/migrations`. We do not use any ORM framework; we use a direct `postgres` client for execution.

