CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_public_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  qr_content TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_city TEXT NOT NULL,
  amount_idr NUMERIC NOT NULL,
  amount_usdc NUMERIC,
  quote_rate NUMERIC,
  quote_expires_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'scanned',
  from_account_address TEXT NOT NULL,
  stellar_tx_hash TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);

-- Partial (terminal-state-excluding) so a user can freely start a new order
-- once their previous one has completed or failed, while enforcing that a
-- user can never have more than one non-terminal order at a time — the
-- app-level check-then-act guard in routes/orders.ts (POST /orders) is only
-- a fast pre-check; this index is what actually closes the race between two
-- truly-concurrent requests that both pass that check before either INSERT
-- lands.
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_in_flight_per_user
  ON orders (user_id) WHERE state NOT IN ('completed', 'failed');

-- Treasury-float pivot (2026-07-15): these columns supported the removed
-- Allbridge/IDRX integration. DROP COLUMN IF EXISTS is idempotent against
-- both a fresh install (columns never existed) and the already-deployed
-- Railway database (columns existed, now removed).
ALTER TABLE orders DROP COLUMN IF EXISTS bridge_status;
ALTER TABLE orders DROP COLUMN IF EXISTS idrx_merchant_order_id;
ALTER TABLE orders DROP COLUMN IF EXISTS idrx_status;

ALTER TABLE users DROP COLUMN IF EXISTS idrx_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS idrx_api_key;
ALTER TABLE users DROP COLUMN IF EXISTS idrx_api_secret;
ALTER TABLE users DROP COLUMN IF EXISTS idrx_deposit_address;
ALTER TABLE users DROP COLUMN IF EXISTS provider;
DROP INDEX IF EXISTS users_idrx_deposit_address_unique;
