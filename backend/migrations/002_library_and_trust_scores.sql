CREATE TABLE IF NOT EXISTS app.library_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    item_type text NOT NULL CHECK (item_type IN ('item', 'skill')),
    title text NOT NULL,
    description text,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for searching items by type
CREATE INDEX IF NOT EXISTS idx_library_items_type ON app.library_items(item_type);

-- Table to track pulse confirmations (to prevent double-confirming and award trust)
CREATE TABLE IF NOT EXISTS app.pulse_confirmations (
    pulse_id uuid NOT NULL REFERENCES app.pulses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pulse_id, user_id)
);
