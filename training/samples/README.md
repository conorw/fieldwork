# training/samples — headstone corpus for local extraction

## Sources

- `synthetic/` — generated clear stones with exact gold labels (EN + multilingual)
- `commons/` — CC/PD images from Wikimedia Commons API (not private cemetery scrapes)
- `curated/` — subset of Commons with gold labels derived from metadata

## Languages (synthetic)

English plus French, German, Spanish, Italian, Latin, Swedish, Irish, Welsh, Polish, Dutch.
Gold labels keep English-canonical relationships (`wife of…` / `husband of…`) while
inscription text stays in the source language.

## Local 100% gate

```bash
python scripts/generate_synthetic_headstones.py
python scripts/collect_headstone_samples.py --limit 40   # Commons API (multi-language categories)
python scripts/curate_commons_labels.py
python scripts/local_headstone_extract_eval.py
```

Exit code 0 means **100%** of labeled samples extracted correctly by the local OCR→parse pipeline
(names, dates, roles, relationships, occupation, veteran).

Latest report: `training/samples/eval_report.json`
