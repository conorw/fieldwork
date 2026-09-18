-- Migration 009: User corrections as first-class training signal
-- Corrections improve this cemetery and feed the shared global adapter.

ALTER TABLE headstone_training_examples
  ADD COLUMN IF NOT EXISTS was_corrected BOOLEAN DEFAULT FALSE;

ALTER TABLE headstone_training_examples
  ADD COLUMN IF NOT EXISTS prediction_json TEXT;

ALTER TABLE headstone_training_examples
  ADD COLUMN IF NOT EXISTS review_source VARCHAR(50) DEFAULT 'confirm';

COMMENT ON COLUMN headstone_training_examples.was_corrected IS
  'True when staff marked the model output wrong and saved a fix';
COMMENT ON COLUMN headstone_training_examples.prediction_json IS
  'Original model/GPT prediction before staff correction (JSON)';
COMMENT ON COLUMN headstone_training_examples.review_source IS
  'confirm | correction | soft_skip';

CREATE INDEX IF NOT EXISTS idx_training_examples_corrected
  ON headstone_training_examples(location_id, was_corrected)
  WHERE was_corrected = TRUE;
