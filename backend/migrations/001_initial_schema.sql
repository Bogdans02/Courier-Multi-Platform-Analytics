CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL CHECK (email = btrim(email) AND email <> ''),
  password_hash TEXT NOT NULL CHECK (btrim(password_hash) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE shifts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at TIMESTAMPTZ NOT NULL CHECK (isfinite(started_at)),
  ended_at TIMESTAMPTZ,
  distance_km NUMERIC(10, 2),
  distance_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The composite key lets expenses reference a shift belonging to the same user.
  UNIQUE (id, user_id),
  CONSTRAINT shifts_time_check CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status = 'completed' AND ended_at IS NOT NULL
        AND isfinite(ended_at) AND ended_at > started_at)
  ),
  CONSTRAINT shifts_distance_check CHECK (
    (distance_km IS NULL AND distance_source IS NULL)
    OR (distance_km IS NOT NULL AND distance_source IS NOT NULL
        AND distance_km >= 0 AND distance_km <> 'NaN'::numeric
        AND distance_source IN ('manual', 'gps'))
  )
);

CREATE INDEX shifts_user_started_at_idx ON shifts (user_id, started_at);
CREATE UNIQUE INDEX shifts_one_active_per_user ON shifts (user_id) WHERE status = 'active';

CREATE TABLE shift_platform_entries (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('glovo', 'bolt_food', 'uber_eats', 'other')),
  earnings_gross NUMERIC(12, 2) NOT NULL CHECK (
    earnings_gross >= 0 AND earnings_gross <> 'NaN'::numeric
  ),
  orders_count INTEGER NOT NULL CHECK (orders_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (shift_id, platform)
);

CREATE TABLE expenses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id INTEGER,
  category TEXT NOT NULL CHECK (btrim(category) <> ''),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0 AND amount <> 'NaN'::numeric),
  expense_date DATE NOT NULL CHECK (isfinite(expense_date)),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT expenses_shift_owner_fk FOREIGN KEY (shift_id, user_id)
    REFERENCES shifts(id, user_id) ON DELETE SET NULL (shift_id)
);

CREATE INDEX expenses_user_date_idx ON expenses (user_id, expense_date);
CREATE INDEX expenses_shift_owner_idx ON expenses (shift_id, user_id) WHERE shift_id IS NOT NULL;

CREATE TABLE user_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- No profiles or tax rates are assumed before the net earnings stage.
  net_profile TEXT CHECK (btrim(net_profile) <> ''),
  deduction_rate NUMERIC(6, 5) CHECK (deduction_rate BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
