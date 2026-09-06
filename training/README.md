# Cemetery VLM trainer (Hugging Face Jobs)

Per-location LoRA fine-tune of **FastVLM-0.5B** on human-reviewed headstone
reasoning JSON. Vercel only **starts** the job; this package does the GPU work.

## Flow

1. Fieldworkers accept/correct GPT analyses → rows in `headstone_training_examples`
2. Owner calls `POST /api/train-headstone` with ≥15 examples
3. Vercel creates an HF Job that clones this repo and runs `python -m training.run_job`
4. Job: download images → LoRA train → merge → (try) ONNX export → Vercel Blob
5. Webhook `POST /api/train-headstone-webhook` sets location `ai_status=local`

## Job payload (`TRAIN_PAYLOAD_JSON`)

```json
{
  "locationId": "...",
  "version": "2026-09-06T20:00:00Z",
  "examples": [
    {
      "imageUrl": "https://....vercel-storage.com/...",
      "stoneType": "couple",
      "target": {
        "people": [
          {
            "full_name": "Jane Smith",
            "role_on_stone": "primary",
            "position": "left",
            "dates": { "birth": "1920", "death": "1998", "aged": null },
            "relationships": ["wife of John Smith"],
            "evidence": "left column, dates under name"
          }
        ],
        "shared": { "surname": "Smith", "epitaph": "" }
      }
    }
  ],
  "webhookUrl": "https://your.app/api/train-headstone-webhook"
}
```

## Local dry-run (GPU machine)

```bash
cd /path/to/fieldwork
python -m venv .venv && source .venv/bin/activate
pip install -r training/requirements.txt

export TRAIN_PAYLOAD_JSON="$(cat training/fixtures/sample_payload.json)"
# or:
python -m training.run_job --payload training/fixtures/sample_payload.json --skip-upload --skip-onnx
```

## Hugging Face Jobs (manual)

Requires [Jobs credit balance](https://huggingface.co/docs/hub/main/en/jobs-pricing).

```bash
hf jobs run \
  --flavor l4x1 \
  --timeout 1h \
  --secret BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN \
  --secret TRAIN_WEBHOOK_SECRET=$TRAIN_WEBHOOK_SECRET \
  --env TRAIN_PAYLOAD_JSON="$(cat payload.json)" \
  --env TRAIN_REPO_URL=https://github.com/YOUR_ORG/fieldwork.git \
  --env TRAIN_REPO_REF=feature/cemetery-train-orchestrator \
  huggingface/transformers-pytorch-gpu:latest \
  -- bash -c 'git clone --depth 1 --branch "$TRAIN_REPO_REF" "$TRAIN_REPO_URL" /tmp/fieldwork && cd /tmp/fieldwork && pip install -q -r training/requirements.txt && python -m training.run_job'
```

Recommended flavor: **`l4x1`** (~$0.80/hr, ~$0.50/train). Try `t4-small` first if you want cheaper; bump if ONNX export OOMs.

## Secrets / env

| Name | Where | Purpose |
|------|--------|---------|
| `HF_TOKEN` | Vercel | Create Jobs |
| `HF_NAMESPACE` | Vercel | HF username or org |
| `HF_JOB_FLAVOR` | Vercel | default `l4x1` |
| `TRAIN_REPO_URL` | Vercel | Git repo containing `training/` |
| `TRAIN_REPO_REF` | Vercel | Branch/tag to clone |
| `BLOB_READ_WRITE_TOKEN` | Vercel + Job secret | Upload adapters |
| `TRAIN_WEBHOOK_SECRET` | Vercel + Job secret | Authenticate webhook |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Update location AI fields |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | Vercel | Validate caller JWT |

## Artifacts on Blob

```
adapters/{locationId}/{version}/
  manifest.json
  adapter/          # PEFT LoRA (small)
  merged/           # Full merged HF weights
  onnx/             # Present if ONNX export succeeded
```

`manifest.export_mode` is `onnx` or `merged_hf`. The PWA worker still needs a follow-up change to load per-location adapters (out of scope for this package).

## Cost

See plan / [HF Jobs GPU pricing](https://huggingface.co/docs/hub/main/en/jobs-pricing#gpu). Typical train ~25–45 min on L4 ≈ **$0.35–$0.60**.
