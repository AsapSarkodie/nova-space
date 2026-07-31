-- Nova Space schema

CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,
  phone               TEXT,
  hostel              TEXT,
  is_student_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id            SERIAL PRIMARY KEY,
  seller_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  listing_type  TEXT NOT NULL CHECK (listing_type IN ('resale', 'store', 'essential')),
  category      TEXT NOT NULL,
  condition     TEXT,
  price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  image_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending', 'sold')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  buyer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id     INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  fulfilment     TEXT NOT NULL DEFAULT 'delivery' CHECK (fulfilment IN ('delivery', 'pickup')),
  hostel         TEXT,
  address        TEXT,
  payment_method TEXT NOT NULL DEFAULT 'momo' CHECK (payment_method IN ('momo', 'cash')),
  delivery_fee   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total          NUMERIC(10, 2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'placed'
                 CHECK (status IN ('placed', 'confirmed', 'out_for_delivery', 'completed', 'cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_type   ON listings (listing_type);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer    ON orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_listing  ON orders (listing_id);

-- Cart checkout support (idempotent upgrades for existing databases)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_group ON orders (group_id);
