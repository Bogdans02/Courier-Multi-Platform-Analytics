-- Ustawienia transportu kuriera: typ pojazdu i parametry paliwa do policzenia kosztu paliwa zmiany.
-- Rower i pieszo nie mają kosztu paliwa, więc spalanie i cena są wtedy NULL.
ALTER TABLE user_settings
  ADD COLUMN transport_type TEXT
    CHECK (transport_type IN ('car', 'scooter', 'motorcycle', 'bike', 'foot')),
  ADD COLUMN fuel_per_100km NUMERIC(5, 2)
    CHECK (fuel_per_100km >= 0 AND fuel_per_100km <> 'NaN'::numeric),
  ADD COLUMN fuel_price_per_l NUMERIC(6, 3)
    CHECK (fuel_price_per_l >= 0 AND fuel_price_per_l <> 'NaN'::numeric),
  -- Pojazdy spalinowe potrzebują obu parametrów; rower i pieszo nie mają żadnego.
  ADD CONSTRAINT transport_fuel_check CHECK (
    transport_type IS NULL
    OR (transport_type IN ('bike', 'foot') AND fuel_per_100km IS NULL AND fuel_price_per_l IS NULL)
    OR (transport_type IN ('car', 'scooter', 'motorcycle')
        AND fuel_per_100km IS NOT NULL AND fuel_price_per_l IS NOT NULL)
  );
