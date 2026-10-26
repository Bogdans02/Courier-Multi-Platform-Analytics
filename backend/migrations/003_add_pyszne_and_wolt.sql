ALTER TABLE shift_platform_entries
  DROP CONSTRAINT shift_platform_entries_platform_check,
  ADD CONSTRAINT shift_platform_entries_platform_check
    CHECK (platform IN ('glovo', 'bolt_food', 'uber_eats', 'pyszne_pl', 'wolt', 'other'));
