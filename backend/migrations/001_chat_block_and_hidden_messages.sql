CREATE TABLE IF NOT EXISTS app.blocked_users (
    blocker_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT blocked_users_no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS app.hidden_messages (
    message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    hidden_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);
