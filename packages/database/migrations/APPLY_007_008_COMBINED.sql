-- Apply in Supabase SQL Editor (project matching VITE_SUPABASE_URL).
-- Idempotent: safe to re-run. Covers migrations 007–010.
-- Do NOT run against unrelated projects (e.g. diversetalent production).

-- ========== 007_location_ai_training ==========
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

CREATE TABLE IF NOT EXISTS headstone_training_examples (
    id VARCHAR(255) PRIMARY KEY,
    location_id VARCHAR(255) NOT NULL,
    plot_id VARCHAR(255),
    plot_image_id VARCHAR(255),
    image_url TEXT NOT NULL,
    stone_type VARCHAR(100) NOT NULL DEFAULT 'unknown',
    target_json TEXT NOT NULL,
    reviewed_by VARCHAR(255) NOT NULL,
    reviewed_at VARCHAR(255) NOT NULL,
    date_created VARCHAR(255) NOT NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_training_examples_location_id ON headstone_training_examples(location_id);
CREATE INDEX IF NOT EXISTS idx_training_examples_stone_type ON headstone_training_examples(stone_type);
CREATE INDEX IF NOT EXISTS idx_training_examples_location_reviewed ON headstone_training_examples(location_id, reviewed_at);

ALTER TABLE headstone_training_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read training examples in their locations" ON headstone_training_examples;
DROP POLICY IF EXISTS "Owners and admins can insert training examples" ON headstone_training_examples;
DROP POLICY IF EXISTS "Owners and admins can update training examples" ON headstone_training_examples;
DROP POLICY IF EXISTS "Owners and admins can delete training examples" ON headstone_training_examples;

CREATE POLICY "Users can read training examples in their locations"
ON headstone_training_examples FOR SELECT
USING (
  location_id IN (SELECT id FROM locations WHERE owner_id = auth.uid())
  OR location_id IN (SELECT location_id FROM location_members WHERE user_id = auth.uid())
);

CREATE POLICY "Owners and admins can insert training examples"
ON headstone_training_examples FOR INSERT
WITH CHECK (
  location_id IN (SELECT id FROM locations WHERE owner_id = auth.uid())
  OR location_id IN (
    SELECT location_id FROM location_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can update training examples"
ON headstone_training_examples FOR UPDATE
USING (
  location_id IN (SELECT id FROM locations WHERE owner_id = auth.uid())
  OR location_id IN (
    SELECT location_id FROM location_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can delete training examples"
ON headstone_training_examples FOR DELETE
USING (
  location_id IN (SELECT id FROM locations WHERE owner_id = auth.uid())
  OR location_id IN (
    SELECT location_id FROM location_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- ========== 008_ai_global_models ==========
CREATE TABLE IF NOT EXISTS ai_global_models (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'default',
    global_adapter_url TEXT,
    global_adapter_version VARCHAR(255),
    updated_at VARCHAR(255) NOT NULL,
    notes TEXT
);

INSERT INTO ai_global_models (id, updated_at, notes)
VALUES ('default', NOW()::text, 'Bootstrap row')
ON CONFLICT (id) DO NOTHING;

-- ========== 009_training_corrections ==========
ALTER TABLE headstone_training_examples
  ADD COLUMN IF NOT EXISTS was_corrected BOOLEAN DEFAULT FALSE;

ALTER TABLE headstone_training_examples
  ADD COLUMN IF NOT EXISTS prediction_json TEXT;

ALTER TABLE headstone_training_examples
  ADD COLUMN IF NOT EXISTS review_source VARCHAR(50) DEFAULT 'confirm';

CREATE INDEX IF NOT EXISTS idx_training_examples_corrected
  ON headstone_training_examples(location_id, was_corrected)
  WHERE was_corrected = TRUE;

-- ========== 010_plot_monument_attrs ==========
ALTER TABLE plots
  ADD COLUMN IF NOT EXISTS monument_material VARCHAR(50),
  ADD COLUMN IF NOT EXISTS monument_form VARCHAR(50),
  ADD COLUMN IF NOT EXISTS monument_condition VARCHAR(50),
  ADD COLUMN IF NOT EXISTS monument_detail TEXT;
