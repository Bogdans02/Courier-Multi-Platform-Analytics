-- Aktywne platformy kuriera. NULL = nie ustawiono = wszystkie aktywne (zgodność wstecz dla istniejących kont).
ALTER TABLE user_settings
  ADD COLUMN active_platforms TEXT[]
    CHECK (active_platforms IS NULL OR (
      array_length(active_platforms, 1) BETWEEN 1 AND 6
      AND active_platforms <@ ARRAY['glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other']
    ));
