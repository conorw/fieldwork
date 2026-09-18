"""
Merge cemetery LoRA into a shared global LoRA (weights only — no images).
Uses simple PEFT state-dict averaging when a prior global adapter exists.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


def average_lora_state_dicts(
    dicts: list[dict[str, Any]],
    weights: list[float] | None = None,
) -> dict[str, Any]:
    if not dicts:
        raise ValueError("No state dicts to average")
    if weights is None:
        weights = [1.0 / len(dicts)] * len(dicts)
    if len(weights) != len(dicts):
        raise ValueError("weights length must match dicts")
    # Normalize
    total = sum(weights) or 1.0
    weights = [w / total for w in weights]

    keys = set(dicts[0].keys())
    for d in dicts[1:]:
        keys &= set(d.keys())

    out: dict[str, Any] = {}
    for key in keys:
        tensors = [d[key] for d in dicts if hasattr(d[key], "float")]
        if not tensors:
            out[key] = dicts[0][key]
            continue
        acc = None
        for t, w in zip([d[key] for d in dicts], weights):
            try:
                piece = t.float() * w
            except Exception:
                out[key] = dicts[0][key]
                break
            acc = piece if acc is None else acc + piece
        else:
            # Cast back to original dtype of first
            out[key] = acc.to(dicts[0][key].dtype)
    return out


def merge_global_adapter(
    cemetery_adapter_dir: Path,
    output_dir: Path,
    *,
    prior_global_dir: Path | None = None,
    cemetery_weight: float = 0.35,
) -> Path:
    """
    Write adapters/global bundle contents under output_dir/global_adapter.
    If prior_global_dir is set, average LoRA tensors; else copy cemetery adapter.
    """
    import torch

    out = output_dir / "global_adapter"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    cem_bin = cemetery_adapter_dir / "adapter_model.safetensors"
    cem_bin_pt = cemetery_adapter_dir / "adapter_model.bin"

    if prior_global_dir and (prior_global_dir / "adapter_model.safetensors").exists():
        try:
            from safetensors.torch import load_file, save_file

            a = load_file(str(prior_global_dir / "adapter_model.safetensors"))
            b = load_file(str(cem_bin)) if cem_bin.exists() else None
            if b is None and cem_bin_pt.exists():
                b = torch.load(cem_bin_pt, map_location="cpu")
            if b is None:
                raise FileNotFoundError("cemetery adapter weights missing")
            merged = average_lora_state_dicts(
                [a, b],
                weights=[1.0 - cemetery_weight, cemetery_weight],
            )
            # Copy config files from cemetery
            for name in ("adapter_config.json", "README.md"):
                src = cemetery_adapter_dir / name
                if src.exists():
                    shutil.copy2(src, out / name)
            save_file(merged, str(out / "adapter_model.safetensors"))
            (out / "global_meta.json").write_text(
                json.dumps(
                    {
                        "method": "lora_average",
                        "cemetery_weight": cemetery_weight,
                    },
                    indent=2,
                )
            )
            return out
        except Exception as e:
            print(f"[global] average failed ({e}); copying cemetery adapter")

    # Fallback: copy cemetery adapter as new global
    shutil.copytree(cemetery_adapter_dir, out, dirs_exist_ok=True)
    (out / "global_meta.json").write_text(
        json.dumps({"method": "copy_cemetery", "note": str(prior_global_dir)}, indent=2)
    )
    return out
