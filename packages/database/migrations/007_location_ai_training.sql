-- Migration 007: Per-cemetery local AI adapter metadata + reviewed training examples
-- Supports teacher (GPT) → HF Jobs LoRA train → local ONNX adapter workflow

-- ============================================================================
-- LOCATIONS: AI adapter fields
-- ============================================================================

ALTER TABLE locations ADD COLUMN IF NOT EXISTS ai_status VARCHAR(50) DEFAULT 'teacher';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS adapter_url TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS adapter_version VARCHAR(255);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS ai_train_error TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS ai_train_job_id VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'locations_ai_status_check'
  ) THEN
    ALTER TABLE locations
      ADD CONSTRAINT locations_ai_status_check
      CHECK (ai_status IN ('teacher', 'training', 'local', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_locations_ai_status ON locations(ai_status);

COMMENT ON COLUMN locations.ai_status IS 'teacher=GPT, training=HF Job running, local=adapter ready, error=last train failed';
COMMENT ON COLUMN locations.adapter_url IS 'Vercel Blob URL prefix for the location ONNX adapter';
COMMENT ON COLUMN locations.adapter_version IS 'ISO version string for the active adapter';
COMMENT ON COLUMN locations.ai_train_error IS 'Last training failure message';
COMMENT ON COLUMN locations.ai_train_job_id IS 'Active or last Hugging Face Jobs id';

-- ============================================================================
-- HEADSTONE_TRAINING_EXAMPLES
-- Reviewed gold labels only — never raw unreviewed GPT output
-- ============================================================================

CREATE TABLE IF NOT EXISTS headstone_training_examples (
    id VARCHAR(255) PRIMARY KEY,
    location_id VARCHAR(255) NOT NULL,
    plot_id VARCHAR(255),
    plot_image_id VARCHAR(255),
    image_url TEXT NOT NULL,
    stone_type VARCHAR(100) NOT NULL DEFAULT 'unknown',
    target_json TEXT NOT NULL, -- reasoning JSON the VLM must emit
    reviewed_by VARCHAR(255) NOT NULL,
    reviewed_at VARCHAR(255) NOT NULL,
    date_created VARCHAR(255) NOT NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_training_examples_location_id
  ON headstone_training_examples(location_id);
CREATE INDEX IF NOT EXISTS idx_training_examples_stone_type
  ON headstone_training_examples(stone_type);
CREATE INDEX IF NOT EXISTS idx_training_examples_location_reviewed
  ON headstone_training_examples(location_id, reviewed_at);

COMMENT ON TABLE headstone_training_examples IS
  'Human-reviewed headstone examples used to fine-tune a per-cemetery local VLM adapter';
COMMENT ON COLUMN headstone_training_examples.target_json IS
  'Frozen reasoning schema JSON (people, position, evidence) — not raw GPT dumps';
COMMENT ON COLUMN headstone_training_examples.stone_type IS
  'single | couple | family | kerb | ledger | cross | child | war | weathered | unknown';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE headstone_training_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read training examples in their locations"
  ON headstone_training_examples;
DROP POLICY IF EXISTS "Owners and admins can insert training examples"
  ON headstone_training_examples;
DROP POLICY IF EXISTS "Owners and admins can update training examples"
  ON headstone_training_examples;
DROP POLICY IF EXISTS "Owners and admins can delete training examples"
  ON headstone_training_examples;

CREATE POLICY "Users can read training examples in their locations"
ON headstone_training_examples FOR SELECT
USING (
  location_id IN (
    SELECT id FROM locations WHERE owner_id = auth.uid()
  )
  OR location_id IN (
    SELECT location_id FROM location_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Owners and admins can insert training examples"
ON headstone_training_examples FOR INSERT
WITH CHECK (
  location_id IN (
    SELECT id FROM locations WHERE owner_id = auth.uid()
  )
  OR location_id IN (
    SELECT location_id FROM location_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can update training examples"
ON headstone_training_examples FOR UPDATE
USING (
  location_id IN (
    SELECT id FROM locations WHERE owner_id = auth.uid()
  )
  OR location_id IN (
    SELECT location_id FROM location_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can delete training examples"
ON headstone_training_examples FOR DELETE
USING (
  location_id IN (
    SELECT id FROM locations WHERE owner_id = auth.uid()
  )
  OR location_id IN (
    SELECT location_id FROM location_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);
