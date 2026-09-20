"""
LoRA fine-tune FastVLM-0.5B on cemetery reasoning JSON.
FastVLM is a LLaVA-style remote-code repo: no AutoProcessor. We use
AutoTokenizer + the model's vision tower image processor, and splice the
IMAGE_TOKEN_INDEX (-200) placeholder into input_ids (per the model card).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from peft import LoraConfig, get_peft_model, TaskType
from torch.utils.data import Dataset as TorchDataset
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

from .schema import BASE_MODEL_ID

IMAGE_TOKEN = "<image>"
IMAGE_TOKEN_INDEX = -200
IGNORE_INDEX = -100


def load_base_model(base_model: str):
    return AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )


def _encode_with_image(
    tokenizer, rendered: str
) -> torch.Tensor:
    """Tokenize chat text, replacing the literal <image> with IMAGE_TOKEN_INDEX."""
    if IMAGE_TOKEN in rendered:
        pre, post = rendered.split(IMAGE_TOKEN, 1)
        pre_ids = tokenizer(pre, return_tensors="pt", add_special_tokens=False).input_ids
        post_ids = tokenizer(post, return_tensors="pt", add_special_tokens=False).input_ids
        img = torch.tensor([[IMAGE_TOKEN_INDEX]], dtype=pre_ids.dtype)
        return torch.cat([pre_ids, img, post_ids], dim=1).squeeze(0)
    return tokenizer(rendered, return_tensors="pt", add_special_tokens=False).input_ids.squeeze(0)


class HeadstoneSFTDataset(TorchDataset):
    def __init__(self, rows: list[dict[str, Any]], tokenizer, image_processor):
        self.rows = rows
        self.tokenizer = tokenizer
        self.image_processor = image_processor

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        row = self.rows[idx]
        from PIL import Image

        image = Image.open(row["image"]).convert("RGB")
        pixel_values = self.image_processor(images=image, return_tensors="pt")[
            "pixel_values"
        ].squeeze(0)

        user = {"role": "user", "content": f"{IMAGE_TOKEN}\n{row['prompt']}"}
        assistant = {"role": "assistant", "content": row["response"]}

        rendered_full = self.tokenizer.apply_chat_template(
            [user, assistant], tokenize=False, add_generation_prompt=False
        )
        rendered_prompt = self.tokenizer.apply_chat_template(
            [user], tokenize=False, add_generation_prompt=True
        )

        input_ids = _encode_with_image(self.tokenizer, rendered_full)
        prompt_ids = _encode_with_image(self.tokenizer, rendered_prompt)

        labels = input_ids.clone()
        prompt_len = min(len(prompt_ids), len(labels))
        labels[:prompt_len] = IGNORE_INDEX
        labels[labels == IMAGE_TOKEN_INDEX] = IGNORE_INDEX

        return {
            "input_ids": input_ids,
            "attention_mask": torch.ones_like(input_ids),
            "labels": labels,
            "images": pixel_values,
        }


def _collate(features: list[dict[str, Any]], pad_id: int) -> dict[str, torch.Tensor]:
    batch: dict[str, Any] = {}
    batch["input_ids"] = torch.nn.utils.rnn.pad_sequence(
        [f["input_ids"] for f in features], batch_first=True, padding_value=pad_id
    )
    batch["attention_mask"] = torch.nn.utils.rnn.pad_sequence(
        [f["attention_mask"] for f in features], batch_first=True, padding_value=0
    )
    batch["labels"] = torch.nn.utils.rnn.pad_sequence(
        [f["labels"] for f in features], batch_first=True, padding_value=IGNORE_INDEX
    )
    batch["images"] = torch.stack([f["images"] for f in features])
    return batch


def train_lora(
    dataset_dir: Path,
    output_dir: Path,
    *,
    base_model: str = BASE_MODEL_ID,
    base_adapter_dir: Path | None = None,
    num_epochs: float = 5.0,
    lora_r: int = 16,
    lora_alpha: int = 32,
    learning_rate: float = 2e-4,
    max_steps: int | None = None,
) -> Path:
    """
    Fine-tune with LoRA and save adapter weights to output_dir/adapter.
    When base_adapter_dir is set (global / prior cemetery LoRA), continue training
    from those weights so new cemeteries inherit shared learning.
    """
    from peft import PeftModel

    from .dataset import load_jsonl

    rows = load_jsonl(dataset_dir / "train.jsonl")
    if len(rows) < 2:
        raise ValueError("Need at least 2 examples to train")

    eval_rows = [rows[-1]] if len(rows) >= 5 else []
    train_rows = rows[:-1] if eval_rows else rows

    print(f"[train] loading base model {base_model}")
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = load_base_model(base_model)
    model.config.use_cache = False
    image_processor = model.get_vision_tower().image_processor

    continued_from: str | None = None
    if (
        base_adapter_dir
        and (base_adapter_dir / "adapter_config.json").exists()
        and (
            (base_adapter_dir / "adapter_model.safetensors").exists()
            or (base_adapter_dir / "adapter_model.bin").exists()
        )
    ):
        print(f"[train] continuing from global/prior adapter {base_adapter_dir}")
        model = PeftModel.from_pretrained(
            model,
            str(base_adapter_dir),
            is_trainable=True,
        )
        continued_from = str(base_adapter_dir)
    else:
        if base_adapter_dir:
            print(
                f"[train] base_adapter_dir incomplete ({base_adapter_dir}); "
                "starting fresh LoRA"
            )
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

    train_ds = HeadstoneSFTDataset(train_rows, tokenizer, image_processor)
    eval_ds = (
        HeadstoneSFTDataset(eval_rows, tokenizer, image_processor)
        if eval_rows
        else None
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    adapter_dir = output_dir / "adapter"

    pad_id = tokenizer.pad_token_id or 0
    args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=num_epochs,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=learning_rate,
        logging_steps=1,
        save_strategy="no",
        eval_strategy="epoch" if eval_ds else "no",
        bf16=torch.cuda.is_available(),
        remove_unused_columns=False,
        report_to=[],
        max_steps=max_steps if max_steps is not None else -1,
        dataloader_pin_memory=False,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=lambda feats: _collate(feats, pad_id),
    )

    print(f"[train] starting LoRA on {len(train_rows)} examples")
    trainer.train()

    adapter_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))
    meta = {
        "base_model": base_model,
        "num_train": len(train_rows),
        "num_eval": len(eval_rows),
        "lora_r": lora_r,
        "lora_alpha": lora_alpha,
        "continued_from": continued_from,
    }
    (adapter_dir / "train_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"[train] adapter saved to {adapter_dir}")
    return adapter_dir
