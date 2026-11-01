CREATE TABLE order_events (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other')),
    clicked_at TIMESTAMPTZ NOT NULL CHECK (isfinite(clicked_at))
);

CREATE INDEX order_events_shift_id ON order_events(shift_id);
