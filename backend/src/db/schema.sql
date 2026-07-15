CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_public_key TEXT NOT NULL UNIQUE,
  kolo_stellar_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qris_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  merchant_name TEXT NOT NULL,
  merchant_city TEXT NOT NULL,
  amount_idr NUMERIC NOT NULL,
  amount_usdc NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qris_scans_user_id_idx ON qris_scans(user_id);

CREATE TABLE IF NOT EXISTS kolo_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount_usdc NUMERIC NOT NULL,
  stellar_tx_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kolo_topups_user_id_idx ON kolo_topups(user_id);

-- Kolo-routing pivot (2026-07-15): the treasury-float order lifecycle is
-- gone entirely — payment now happens in the user's own GoPay app via a
-- linked Kolo card, outside this system. DROP TABLE IF EXISTS is idempotent
-- against both a fresh install (table never existed) and the already-
-- deployed Railway database (table existed, now removed).
DROP TABLE IF EXISTS orders;
