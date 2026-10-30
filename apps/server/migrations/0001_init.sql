-- Menu

CREATE TABLE category (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE menu_item (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_centavos INTEGER NOT NULL CHECK (price_centavos >= 0),
  category_id INTEGER NOT NULL REFERENCES category (id),
  image_path TEXT,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX menu_item_category ON menu_item (category_id);

CREATE TABLE modifier_group (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES menu_item (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min INTEGER NOT NULL DEFAULT 0,
  max INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  CHECK (min >= 0 AND max >= 1 AND min <= max)
);
CREATE INDEX modifier_group_item ON modifier_group (item_id);

CREATE TABLE modifier (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES modifier_group (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta_centavos INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX modifier_group_id ON modifier (group_id);

-- Orders

CREATE TABLE "order" (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  business_day TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('placed', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')),
  table_or_name TEXT NOT NULL,
  total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_day, number)
);
CREATE INDEX order_status_created ON "order" (status, created_at);

CREATE TABLE order_line (
  id INTEGER PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES "order" (id),
  item_id INTEGER NOT NULL REFERENCES menu_item (id),
  name_snapshot TEXT NOT NULL,
  unit_price_snapshot INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  notes TEXT
);
CREATE INDEX order_line_order ON order_line (order_id);

CREATE TABLE order_line_modifier (
  line_id INTEGER NOT NULL REFERENCES order_line (id),
  modifier_id INTEGER NOT NULL REFERENCES modifier (id),
  name_snapshot TEXT NOT NULL,
  price_delta_snapshot INTEGER NOT NULL,
  PRIMARY KEY (line_id, modifier_id)
);

CREATE TABLE order_event (
  id INTEGER PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES "order" (id),
  "from" TEXT,
  "to" TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL
);
CREATE INDEX order_event_order ON order_event (order_id);

-- Daily order number counter (numbers reset each business day)
CREATE TABLE daily_counter (
  business_day TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL
);

-- Staff sessions (only the SHA-256 of the token is stored)
CREATE TABLE staff_session (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
