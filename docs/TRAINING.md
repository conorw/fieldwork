# Per-cemetery local VLM training

Fieldwork can specialize a small vision-language model **per cemetery** after GPT-assisted onboarding.

## Modes on a location

| `ai_status` | Meaning |
|-------------|---------|
| `teacher` | Use GPT (`/api/analyze-headstone`) |
| `training` | HF Job running |
| `local` | Adapter on Blob; PWA may use local model (worker wiring TBD) |
| `error` | Last train failed; stay on GPT and show `ai_train_error` |

## Data path

1. User reviews GPT output → `saveReviewedTrainingExample()` → `headstone_training_examples`
2. When ≥15 reviewed examples → `startLocationTraining(locationId)`
3. [`api/train-headstone.ts`](../api/train-headstone.ts) starts a [Hugging Face Job](https://huggingface.co/docs/hub/main/en/jobs-pricing)
4. [`training/`](../training/) LoRA-trains FastVLM-0.5B, uploads to Blob, webhooks
5. [`api/train-headstone-webhook.ts`](../api/train-headstone-webhook.ts) sets `ai_status=local`

See [`training/README.md`](../training/README.md) for GPU ops and cost (~$0.50/train on L4).

## Tests

```bash
# Node integration suite (orchestrator, webhook, helpers, client payload)
npm run test:train

# Full vitest suite (excludes live clip API test)
npm test

# Python trainer schema / webhook / dataset smoke (GPU optional)
npm run test:train:py
# or: python -m unittest training.tests.test_schema_and_pipeline -v
```

Coverage:

| Area | File |
|------|------|
| Example gate + HF job body | `tests/train/helpers.spec.ts` |
| `POST/GET /api/train-headstone` | `tests/train/orchestrator.spec.ts` |
| Webhook auth + state updates | `tests/train/webhook.spec.ts` |
| teacher → training → local/error | `tests/train/flow.spec.ts` |
| Client payload helpers | `tests/train/client-payload.spec.ts` |
| Python schema / webhook / dry-run | `training/tests/test_schema_and_pipeline.py` |

HF Jobs, Supabase, and Blob are mocked in the Node suite. Real GPU training is not run in CI. Torch/Pillow tests skip automatically when those packages are absent.

## Apply DB migration

```bash
# Apply packages/database/migrations/007_location_ai_training.sql in Supabase SQL editor
# Then add sync query #9 from docs/POWERSYNC_SYNC_QUERIES.md in PowerSync dashboard
```

## Out of scope (follow-ups)

- Onboarding checklist UI for stone types
- Loading `adapter_url` in [`src/workers/llmWorker.ts`](../src/workers/llmWorker.ts)
- Spatial reasoning prompt swap in localLLMService
