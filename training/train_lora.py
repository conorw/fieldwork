"""
LoRA fine-tune FastVLM-0.5B on cemetery reasoning JSON.
Uses PEFT + a simple supervised loop compatible with small datasets (15–40 images).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from peft import LoraConfig, get_peft_model, TaskType
from torch.utils.data import Dataset as TorchDataset
from transformers import AutoModelForCausalLM, AutoProcessor, Trainer, TrainingArguments

try:
    from transformers import AutoModelForImageTextToText
except ImportError:  # older transformers
    AutoModelForImageTextToText = None  # type: ignore

from .schema import BASE_MODEL_ID


def _load_base_model(base_model: str):
    kwargs = dict(
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    if AutoModelForImageTextToText is not None:
        try:
            return AutoModelForImageTextToText.from_pretrained(base_model, **kwargs)
        except Exception as e:
            print(f"[train] AutoModelForImageTextToText failed ({e}); trying CausalLM")
    return AutoModelForCausalLM.from_pretrained(base_model, **kwargs)


class HeadstoneSFTDataset(TorchDataset):
    def __init__(self, rows: list[dict[str, Any]], processor):
        self.rows = rows
        self.processor = processor

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        row = self.rows[idx]
        from PIL import Image

        image = Image.open(row["image"]).convert("RGB")
        # Chat-style: user prompt with image, assistant = reasoning JSON
        messages = [
            {
                "role": "user",
                "content": f"<image>\n{row['prompt']}",
            },
            {
                "role": "assistant",
                "content": row["response"],
            },
        ]

        # Fallback if apply_chat_template is unavailable
        if hasattr(self.processor, "apply_chat_template"):
            text = self.processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=False
            )
        else:
            text = f"<image>\n{row['prompt']}\n{row['response']}"

        inputs = self.processor(
            text=text,
            images=image,
            return_tensors="pt",
            padding=True,
        )
        # Squeeze batch dim added by processor
        item = {k: v.squeeze(0) for k, v in inputs.items()}
        if "input_ids" in item:
            item["labels"] = item["input_ids"].clone()
        return item


def _collate(features: list[dict[str, Any]], processor) -> dict[str, torch.Tensor]:
    # Pad variable-length tensors
    keys = [k for k in features[0].keys() if k != "labels"]
    batch: dict[str, Any] = {}
    pad_id = getattr(processor.tokenizer, "pad_token_id", 0) or 0

    for key in keys:
        vals = [f[key] for f in features]
        if vals[0].dim() == 1:
            batch[key] = torch.nn.utils.rnn.pad_sequence(
                vals, batch_first=True, padding_value=pad_id if key == "input_ids" else 0
            )
        else:
            # vision tensors — stack if same shape, else keep list (rare)
            try:
                batch[key] = torch.stack(vals)
            except RuntimeError:
                batch[key] = vals

    if "labels" in features[0]:
        labels = [f["labels"] for f in features]
        batch["labels"] = torch.nn.utils.rnn.pad_sequence(
            labels, batch_first=True, padding_value=-100
        )
    return batch


def train_lora(
    dataset_dir: Path,
    output_dir: Path,
    *,
    base_model: str = BASE_MODEL_ID,
    num_epochs: float = 5.0,
    lora_r: int = 16,
    lora_alpha: int = 32,
    learning_rate: float = 2e-4,
    max_steps: int | None = None,
) -> Path:
    """
    Fine-tune with LoRA and save adapter weights to output_dir/adapter.
    Holds out the last example when n >= 5 for a tiny eval split.
    """
    from .dataset import load_jsonl

    rows = load_jsonl(dataset_dir / "train.jsonl")
    if len(rows) < 2:
        raise ValueError("Need at least 2 examples to train")

    eval_rows = [rows[-1]] if len(rows) >= 5 else []
    train_rows = rows[:-1] if eval_rows else rows

    print(f"[train] loading base model {base_model}")
    processor = AutoProcessor.from_pretrained(base_model, trust_remote_code=True)
    model = _load_base_model(base_model)

    lora_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    train_ds = HeadstoneSFTDataset(train_rows, processor)
    eval_ds = HeadstoneSFTDataset(eval_rows, processor) if eval_rows else None

    output_dir.mkdir(parents=True, exist_ok=True)
    adapter_dir = output_dir / "adapter"

    args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=num_epochs,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=learning_rate,
        logging_steps=1,
        save_strategy="epoch",
        eval_strategy="epoch" if eval_ds else "no",
        bf16=torch.cuda.is_available(),
        remove_unused_columns=False,
        report_to=[],
        max_steps=max_steps if max_steps is not None else -1,
        load_best_model_at_end=bool(eval_ds),
        metric_for_best_model="eval_loss" if eval_ds else None,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=lambda feats: _collate(feats, processor),
    )

    print(f"[train] starting LoRA on {len(train_rows)} examples")
    trainer.train()

    adapter_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(adapter_dir))
    processor.save_pretrained(str(adapter_dir))
    meta = {
        "base_model": base_model,
        "num_train": len(train_rows),
        "num_eval": len(eval_rows),
        "lora_r": lora_r,
        "lora_alpha": lora_alpha,
    }
    (adapter_dir / "train_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"[train] adapter saved to {adapter_dir}")
    return adapter_dir
