-- Migration 013: Create lost_documents table
-- Implements storage for lost documents.

CREATE TABLE IF NOT EXISTS app.lost_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    location geography(Point, 4326) NOT NULL,
    image_censored VARCHAR(512),
    image_original VARCHAR(512)
);
