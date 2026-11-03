-- Uploaded files (Milestone 5, DECISIONS #91). Every file stored through the app gets a row
-- before it is written, so Restore can find and delete it, and a form can only use files its
-- own person uploaded and nothing has used yet. `attached_at` is set when an item or a proof
-- takes the file.
CREATE TABLE uploads (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users (id),
  purpose       text NOT NULL CHECK (purpose IN ('photo', 'proof')),
  pathname      text NOT NULL UNIQUE CHECK (btrim(pathname) <> ''),
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes         integer NOT NULL CHECK (bytes > 0),
  attached_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_person ON uploads (user_id, created_at DESC);

-- The daily upload caps count from here (DECISIONS #92). It is not an app table: Restore
-- leaves it alone, so restoring the demo can't reset the caps. No foreign key, because
-- Restore empties and renumbers users (they come back with the same ids).
CREATE TABLE upload_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upload_log_recent ON upload_log (created_at);
