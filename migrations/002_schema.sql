-- The real schema (SPEC §9, DECISIONS #74). Additive only: app_meta stays until after 2C is
-- live (#74), so the previous deployment and the current seed check keep working.
-- Money is whole dollars stored as integer cents (SPEC §7.9). Every timestamp is timestamptz.

CREATE TABLE events (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                    text NOT NULL CHECK (btrim(name) <> ''),
  time_zone               text NOT NULL DEFAULT 'America/New_York',
  submissions_open_at     timestamptz,
  bidding_opens_at        timestamptz,
  bidding_closes_at       timestamptz,
  min_starting_bid_cents  integer NOT NULL DEFAULT 1000 CHECK (min_starting_bid_cents > 0 AND min_starting_bid_cents % 100 = 0),
  bid_increment_cents     integer NOT NULL DEFAULT 500 CHECK (bid_increment_cents > 0 AND bid_increment_cents % 100 = 0),
  proof_deadline_days     integer NOT NULL DEFAULT 7 CHECK (proof_deadline_days BETWEEN 1 AND 60),
  giving_platform_url     text,
  -- Set exactly once, by the first request after bidding closes (SPEC §7.1).
  winners_finalized_at    timestamptz,
  -- The yearly reset adds next year's event and makes it current; the old one stays (#71).
  is_current              boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (submissions_open_at IS NULL OR bidding_opens_at IS NULL OR submissions_open_at <= bidding_opens_at),
  CHECK (bidding_opens_at IS NULL OR bidding_closes_at IS NULL OR bidding_opens_at < bidding_closes_at)
);
CREATE UNIQUE INDEX events_one_current ON events (is_current) WHERE is_current;

CREATE TABLE users (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name  text NOT NULL CHECK (btrim(first_name) <> ''),
  last_name   text NOT NULL CHECK (btrim(last_name) <> ''),
  role        text NOT NULL CHECK (role IN ('admin', 'employee')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE charities (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL UNIQUE,
  description  text NOT NULL,
  -- Each charity keeps its own path; all three point at the placeholder until the owner's files arrive (#72).
  logo_path    text NOT NULL,
  position     smallint NOT NULL UNIQUE CHECK (position > 0)
);

CREATE TABLE items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id            bigint NOT NULL REFERENCES events (id),
  submitter_id        bigint NOT NULL REFERENCES users (id),
  type                text NOT NULL CHECK (type IN ('auction', 'instant')),
  title               text NOT NULL CHECK (btrim(title) <> ''),
  description         text NOT NULL,
  starting_bid_cents  integer CHECK (starting_bid_cents > 0 AND starting_bid_cents % 100 = 0),
  price_cents         integer CHECK (price_cents > 0 AND price_cents % 100 = 0),
  quantity            integer CHECK (quantity > 0),
  remaining           integer,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelled_at        timestamptz,
  -- The nullable side of the items ↔ bids cycle: empty until winners are finalized (#74).
  winning_bid_id      bigint,
  -- Always false; lets the winner_not_removed key below require a bid that isn't removed.
  winner_is_removed   boolean GENERATED ALWAYS AS (false) STORED,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Each sale type has exactly its own money and stock columns.
  CONSTRAINT items_auction_columns CHECK (type <> 'auction' OR (starting_bid_cents IS NOT NULL AND price_cents IS NULL AND quantity IS NULL AND remaining IS NULL)),
  CONSTRAINT items_instant_columns CHECK (type <> 'instant' OR (starting_bid_cents IS NULL AND price_cents IS NOT NULL AND quantity IS NOT NULL AND remaining IS NOT NULL)),
  -- Inventory never goes below zero or above what was offered (SPEC §7.5).
  CONSTRAINT items_remaining_range CHECK (remaining IS NULL OR remaining BETWEEN 0 AND quantity),
  CONSTRAINT items_cancelled_at CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT items_winner_auction_only CHECK (winning_bid_id IS NULL OR type = 'auction')
);
CREATE INDEX items_event ON items (event_id, type);
CREATE INDEX items_submitter ON items (submitter_id);

CREATE TABLE item_photos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     bigint NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  -- 1 is the cover. Deferrable so a reorder can swap two positions in one transaction.
  position    smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  path        text NOT NULL CHECK (btrim(path) <> ''),
  source      text NOT NULL CHECK (source IN ('seed', 'upload')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_photos_position UNIQUE (item_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE bids (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id       bigint NOT NULL REFERENCES items (id),
  bidder_id     bigint NOT NULL REFERENCES users (id),
  amount_cents  integer NOT NULL CHECK (amount_cents > 0 AND amount_cents % 100 = 0),
  -- Always the database's clock, never the browser's (SPEC §7.4).
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Admins remove bids; rows are never deleted.
  removed_at    timestamptz,
  removed_by    bigint REFERENCES users (id),
  is_removed    boolean GENERATED ALWAYS AS (removed_at IS NOT NULL) STORED,
  CONSTRAINT bids_removed_pair CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  -- Targets for the items' winner keys.
  CONSTRAINT bids_id_item UNIQUE (id, item_id),
  CONSTRAINT bids_id_item_removed UNIQUE (id, item_id, is_removed)
);
CREATE INDEX bids_item_amount ON bids (item_id, amount_cents DESC);
CREATE INDEX bids_bidder ON bids (bidder_id);

-- The winner is a bid on this same item...
ALTER TABLE items ADD CONSTRAINT items_winner_same_item
  FOREIGN KEY (winning_bid_id, id) REFERENCES bids (id, item_id);
-- ...and never a removed bid. Deferred to commit, so removing the winning bid and moving the
-- winner happen in one transaction; forgetting to move it fails the commit (#74).
ALTER TABLE items ADD CONSTRAINT items_winner_not_removed
  FOREIGN KEY (winning_bid_id, id, winner_is_removed) REFERENCES bids (id, item_id, is_removed)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE purchases (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id       bigint NOT NULL REFERENCES items (id),
  buyer_id      bigint NOT NULL REFERENCES users (id),
  -- The price when bought, so a later edit can't change what someone owes.
  price_cents   integer NOT NULL CHECK (price_cents > 0 AND price_cents % 100 = 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz
);
CREATE INDEX purchases_item ON purchases (item_id);
CREATE INDEX purchases_buyer ON purchases (buyer_id);

-- One combined proof per person per event, covering their donation total (SPEC §7.6, #69).
-- Each upload is a new row; the latest counts.
CREATE TABLE proofs (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id          bigint NOT NULL REFERENCES events (id),
  user_id           bigint NOT NULL REFERENCES users (id),
  amount_cents      integer NOT NULL CHECK (amount_cents > 0 AND amount_cents % 100 = 0),
  -- The donation total when this proof was uploaded; compared with the live total.
  owed_cents        integer NOT NULL CHECK (owed_cents >= 0 AND owed_cents % 100 = 0),
  image_path        text NOT NULL CHECK (btrim(image_path) <> ''),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  text,
  reviewed_by       bigint REFERENCES users (id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proofs_rejection_reason CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')),
  CONSTRAINT proofs_review_pair CHECK ((status = 'pending') = (reviewed_at IS NULL) AND (reviewed_at IS NULL) = (reviewed_by IS NULL))
);
CREATE INDEX proofs_person ON proofs (event_id, user_id, created_at DESC);

-- The six templates (SPEC §7.7). Defaults live in code, for Restore default and the reset.
CREATE TABLE email_templates (
  key         text PRIMARY KEY CHECK (key IN ('bid_receipt', 'outbid', 'winner', 'purchase_receipt', 'proof_rejected', 'item_cancelled')),
  subject     text NOT NULL,
  body        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
