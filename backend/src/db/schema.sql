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

-- kolo_stellar_address is declared in CREATE TABLE users above for a fresh
-- install, but production's users table already existed before this column
-- was introduced (from the earlier treasury-float deploy), so
-- CREATE TABLE IF NOT EXISTS is a no-op there. This ALTER is idempotent
-- additive insurance to make sure the column lands on redeploy too.
ALTER TABLE users ADD COLUMN IF NOT EXISTS kolo_stellar_address TEXT;

-- Cleanup carried over from the treasury-float pivot's schema.sql, which got
-- dropped when the Kolo-routing pivot replaced this file wholesale. These
-- columns supported the original IDRX-based onboarding (KYC identity,
-- bank/e-wallet linkage) and have been dead since the treasury-float pivot
-- removed IDRX entirely. Idempotent against both a fresh install (columns
-- never existed) and any already-deployed database still carrying them.
ALTER TABLE users DROP COLUMN IF EXISTS idrx_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS idrx_api_key;
ALTER TABLE users DROP COLUMN IF EXISTS idrx_api_secret;
ALTER TABLE users DROP COLUMN IF EXISTS idrx_deposit_address;
ALTER TABLE users DROP COLUMN IF EXISTS provider;
DROP INDEX IF EXISTS users_idrx_deposit_address_unique;
