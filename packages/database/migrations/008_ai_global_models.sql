-- Migration 008: Global AI adapter pointer (weights only; no photos)
-- Allows cemetery N+1 to start from a shared LoRA / ONNX base.

CREATE TABLE IF NOT EXISTS ai_global_models (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'default',
    global_adapter_url TEXT,
    global_adapter_version VARCHAR(255),
    updated_at VARCHAR(255) NOT NULL,
    notes TEXT
);

COMMENT ON TABLE ai_global_models IS
  'Singleton row for shared VLM adapters (LoRA/ONNX weights). Never stores cemetery photos.';

INSERT INTO ai_global_models (id, updated_at, notes)
VALUES ('default', NOW()::text, 'Bootstrap row')
ON CONFLICT (id) DO NOTHING;
