CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_public_key TEXT NOT NULL UNIQUE,
  idrx_user_id INTEGER,
  idrx_api_key TEXT,
  idrx_api_secret TEXT,
  idrx_deposit_address TEXT,
  provider TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial (NULL-excluding) so pre-onboarding-completion users (no deposit
-- address yet) don't collide with each other, while enforcing that any
-- assigned deposit address maps back to exactly one user — the webhook
-- reconciliation in routes/webhooks.ts relies on this being true.
CREATE UNIQUE INDEX IF NOT EXISTS users_idrx_deposit_address_unique
  ON users (idrx_deposit_address) WHERE idrx_deposit_address IS NOT NULL;

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
  bridge_status TEXT,
  idrx_merchant_order_id TEXT,
  idrx_status TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
