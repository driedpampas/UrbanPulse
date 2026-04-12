ALTER TABLE app.users
ADD COLUMN IF NOT EXISTS profile_picture_filename text,
ADD COLUMN IF NOT EXISTS profile_picture_mime_type text,
ADD COLUMN IF NOT EXISTS profile_picture_size_bytes integer,
ADD COLUMN IF NOT EXISTS profile_picture_updated_at timestamptz;
