-- Dzienny cel zarobku kuriera (zł). Opcjonalny: NULL = cel nie jest ustawiony i nie pokazujemy go na ekranie.
ALTER TABLE user_settings
  ADD COLUMN daily_goal NUMERIC(8, 2)
    CHECK (daily_goal >= 0 AND daily_goal <> 'NaN'::numeric);
