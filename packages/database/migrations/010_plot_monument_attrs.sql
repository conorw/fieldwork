-- Physical monument attributes extracted / confirmed from headstone photos
ALTER TABLE plots
  ADD COLUMN IF NOT EXISTS monument_material VARCHAR(50),
  ADD COLUMN IF NOT EXISTS monument_form VARCHAR(50),
  ADD COLUMN IF NOT EXISTS monument_condition VARCHAR(50),
  ADD COLUMN IF NOT EXISTS monument_detail TEXT;

COMMENT ON COLUMN plots.monument_material IS
  'granite | marble | slate | limestone | sandstone | bronze | wood | concrete | other | unknown';
COMMENT ON COLUMN plots.monument_form IS
  'upright | arched | desk | kerb | ledger | cross | plaque | cremation | obelisk | other | unknown';
COMMENT ON COLUMN plots.monument_condition IS
  'excellent | good | fair | weathered | damaged | leaning | fallen | illegible | new | unknown';
COMMENT ON COLUMN plots.monument_detail IS
  'Optional free-text detail about material/form/condition';
