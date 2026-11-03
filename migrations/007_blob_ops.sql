-- Our own Blob operations that count toward Hobby's monthly allowance (DECISIONS #96): each
-- upload (put) and each page of a Restore's list. Uploads stop well before the allowance runs
-- out. Like upload_log, not an app table, so Restore leaves it alone.
CREATE TABLE blob_ops (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('put', 'list')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blob_ops_recent ON blob_ops (created_at);
