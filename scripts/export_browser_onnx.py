"""Merge the published sample LoRA and upload a transformers.js ONNX repo.

The browser loads three graphs. The LoRA only changed the language-model
projections, so the vision encoder and token embeddings are copied from
onnx-community/FastVLM-0.5B-ONNX. The decoder graph is that public model
with the merged sample weights written into the matching initializers.

Run on a GPU. Local machines do not have the toolchain.
"""

from __future__ import annotations

import json
import os
import shutil
import urllib.request
from pathlib import Path

import torch
from huggingface_hub import HfApi, hf_hub_download
from peft import PeftModel
from transformers import AutoModelForCausalLM

BASE_MODEL = "apple/FastVLM-0.5B"
PUBLIC_ONNX = "onnx-community/FastVLM-0.5B-ONNX"
ADAPTER_BASE = os.environ.get(
    "ADAPTER_BASE_URL",
    "https://fieldwork.conorw.workers.dev/files/adapters/global/latest/",
).rstrip("/") + "/"
REPO_ID = os.environ.get(
    "ONNX_REPO_ID",
    "conorwoods/fieldwork-fastvlm-0.5b-onnx",
)
UA = "fieldwork-train/1.0"


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as resp:
        dest.write_bytes(resp.read())
    print(f"[export] fetched {dest.name} ({dest.stat().st_size} bytes)")


def download_adapter(dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    for name in (
        "adapter_config.json",
        "adapter_model.safetensors",
        "tokenizer_config.json",
        "tokenizer.json",
        "special_tokens_map.json",
        "added_tokens.json",
        "vocab.json",
        "merges.txt",
        "chat_template.jinja",
    ):
        try:
            fetch(ADAPTER_BASE + name, dest / name)
        except Exception as exc:
            print(f"[export] optional adapter file {name}: {exc}")
    if not (dest / "adapter_model.safetensors").exists():
        raise RuntimeError("adapter weights were not downloaded")
    return dest


def _parameter(merged: torch.nn.Module, key: str):
    params = dict(merged.named_parameters())
    if key in params:
        return params[key]
    hits = [name for name in params if name.endswith(key)]
    if not hits:
        return None
    hits.sort(key=len)
    return params[hits[0]]


def patch_public_decoder(merged: torch.nn.Module, dest: Path) -> None:
    """Write the merged LoRA into the public FastVLM decoder graph."""
    import re

    import numpy as np
    import onnx
    from onnx import numpy_helper

    src = Path(hf_hub_download(PUBLIC_ONNX, "onnx/decoder_model_merged_fp16.onnx"))
    print(f"[export] public decoder {src.stat().st_size} bytes")
    model = onnx.load(str(src))

    rules = [
        (
            re.compile(r"^model\.layers\.(\d+)\.attn\.(q|k|v|o)_proj\.MatMul\.weight$"),
            lambda m: f"model.layers.{m.group(1)}.self_attn.{m.group(2)}_proj.weight",
            True,
        ),
        (
            re.compile(r"^model\.layers\.(\d+)\.attn\.(q|k|v|o)_proj\.Add\.bias$"),
            lambda m: f"model.layers.{m.group(1)}.self_attn.{m.group(2)}_proj.bias",
            False,
        ),
        (
            re.compile(r"^model\.layers\.(\d+)\.mlp\.(gate|up|down)_proj\.MatMul\.weight$"),
            lambda m: f"model.layers.{m.group(1)}.mlp.{m.group(2)}_proj.weight",
            True,
        ),
        (
            re.compile(r"^model\.layers\.(\d+)\.input_layernorm\.weight$"),
            lambda m: f"model.layers.{m.group(1)}.input_layernorm.weight",
            False,
        ),
        (
            re.compile(r"^model\.layers\.(\d+)\.post_attention_layernorm\.weight$"),
            lambda m: f"model.layers.{m.group(1)}.post_attention_layernorm.weight",
            False,
        ),
        (
            re.compile(r"^model\.layers\.24\.final_norm_layernorm\.weight$"),
            lambda _m: "model.norm.weight",
            False,
        ),
        (re.compile(r"^lm_head\.MatMul\.weight$"), lambda _m: "lm_head.weight", False),
    ]

    replaced = 0
    required = 0
    misses: list[str] = []
    changed = False
    for init in model.graph.initializer:
        mapped = None
        is_required = False
        for pattern, builder, req in rules:
            match = pattern.fullmatch(init.name)
            if match:
                mapped = builder(match)
                is_required = req
                break
        if mapped is None:
            continue
        param = _parameter(merged, mapped)
        if param is None:
            if is_required:
                misses.append(f"{init.name} -> {mapped}")
            continue
        arr = param.detach().float().cpu().numpy()
        # The graph multiplies inputs by [in, out]. PyTorch Linear stores [out, in].
        if arr.ndim == 2:
            arr = np.ascontiguousarray(arr.T)
        dims = list(init.dims)
        if list(arr.shape) != dims:
            if is_required:
                misses.append(f"{init.name} shape {tuple(arr.shape)} vs {dims}")
            continue
        before = numpy_helper.to_array(init).astype(np.float32)
        if float(np.max(np.abs(before - arr))) > 1e-3:
            changed = True
        init.CopyFrom(numpy_helper.from_array(arr.astype(np.float16), name=init.name))
        replaced += 1
        if is_required:
            required += 1

    if misses:
        raise RuntimeError("unmatched decoder weights: " + "; ".join(misses[:8]))
    # q/k/v/o plus gate/up/down, 24 layers.
    if required < 24 * 7:
        raise RuntimeError(f"only patched {required} trained projections")
    if not changed:
        raise RuntimeError("merged weights match the public decoder; LoRA was not applied")

    dest.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(dest))
    print(f"[export] patched decoder {dest.stat().st_size} bytes ({replaced} tensors)")


def align_matmul_nbits_scales(model) -> int:
    import numpy as np
    from onnx import TensorProto, numpy_helper

    weights = {init.name: init for init in model.graph.initializer}
    aligned = 0
    for node in model.graph.node:
        if node.op_type != "MatMulNBits" or len(node.input) < 3:
            continue
        scale = weights.get(node.input[2])
        if scale is None or scale.data_type != TensorProto.FLOAT:
            if scale is not None and scale.data_type == TensorProto.FLOAT16:
                aligned += 1
            continue
        arr = numpy_helper.to_array(scale).astype(np.float16)
        scale.CopyFrom(numpy_helper.from_array(np.ascontiguousarray(arr), scale.name))
        aligned += 1
    return aligned


def quantize_q4f16(src_dir: Path, dest_dir: Path) -> None:
    import numpy as np
    import onnx
    from onnx import TensorProto, numpy_helper
    from onnxruntime.quantization.matmul_4bits_quantizer import MatMul4BitsQuantizer

    src = src_dir / "decoder_model_merged.onnx"
    model = onnx.load(str(src))
    weights = {init.name: init for init in model.graph.initializer}
    converted = 0
    for node in model.graph.node:
        if node.op_type != "MatMul" or len(node.input) < 2:
            continue
        init = weights.get(node.input[1])
        if init is None or init.data_type != TensorProto.FLOAT16:
            continue
        arr = numpy_helper.to_array(init).astype(np.float32)
        init.CopyFrom(numpy_helper.from_array(np.ascontiguousarray(arr), init.name))
        converted += 1
    if converted < 24 * 7:
        raise RuntimeError(f"only prepared {converted} MatMul weights for 4-bit")

    quantizer = MatMul4BitsQuantizer(model, block_size=32, is_symmetric=True)
    quantizer.process()
    quantized = quantizer.model.model
    nbits = sum(1 for node in quantized.graph.node if node.op_type == "MatMulNBits")
    if nbits < 24 * 7:
        raise RuntimeError(f"quantizer left {nbits} MatMulNBits nodes")
    # Activations stay float16. The quantizer writes float32 scales, and
    # MatMulNBits requires those scales to use the same type as the activation.
    cast_scales = align_matmul_nbits_scales(quantized)
    if cast_scales < nbits:
        raise RuntimeError(f"only aligned {cast_scales} of {nbits} scale tensors")

    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / "decoder_model_merged_q4f16.onnx"
    onnx.save(quantized, str(out))
    print(f"[export] decoder q4f16 {out.stat().st_size} bytes ({nbits} MatMulNBits)")


def copy_public_files(repo: Path) -> None:
    names = [
        "config.json",
        "generation_config.json",
        "preprocessor_config.json",
        "processor_config.json",
        "tokenizer_config.json",
        "tokenizer.json",
        "special_tokens_map.json",
        "added_tokens.json",
        "vocab.json",
        "merges.txt",
        "onnx/embed_tokens_fp16.onnx",
        "onnx/vision_encoder_fp16.onnx",
    ]
    for name in names:
        src = hf_hub_download(PUBLIC_ONNX, name)
        dest = repo / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dest)
        print(f"[export] copied {name}")


def publish_manifest(revision: str | None = None) -> None:
    token = os.environ.get("STORAGE_SECRET") or os.environ.get("TRAIN_WEBHOOK_SECRET")
    upload = os.environ.get("STORAGE_UPLOAD_URL", "").rstrip("/")
    if not token or not upload:
        print("[export] no storage credentials; skip manifest pointer")
        return
    version = os.environ.get("ONNX_VERSION", "onnx-1")
    pointer = {
        "kind": "global_onnx",
        "version": version,
        "export_mode": "onnx",
        "onnx_model_id": REPO_ID,
        "onnx_revision": revision or "",
        "base_model": BASE_MODEL,
        "lora_adapter": ADAPTER_BASE,
        "note": "Sample-trained decoder. Vision encoder and embeddings are the public FastVLM ONNX graphs.",
    }
    data = json.dumps(pointer, indent=2).encode()
    req = urllib.request.Request(
        f"{upload}/adapters/global/latest/manifest.json",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        print("[export] manifest", resp.status, resp.read()[:200])


def main() -> None:
    work = Path(os.environ.get("EXPORT_WORK_DIR", "/tmp/fw-onnx"))
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    adapter = download_adapter(work / "adapter")

    print("[export] loading base model")
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.float16,
        trust_remote_code=True,
    )
    print("[export] merging LoRA")
    merged = PeftModel.from_pretrained(base, str(adapter)).merge_and_unload()
    merged.eval()

    fp16 = work / "decoder_fp32" / "decoder_model_merged.onnx"
    patch_public_decoder(merged, fp16)
    del merged, base
    torch.cuda.empty_cache()

    repo = work / "repo"
    (repo / "onnx").mkdir(parents=True)
    # Keep the public ONNX tokenizer. It is the one that maps <image> to
    # image_token_index 151646. The Apple tokenizer does not.
    copy_public_files(repo)
    quantize_q4f16(fp16.parent, repo / "onnx")

    readme = repo / "README.md"
    readme.write_text(
        "---\n"
        "library_name: transformers.js\n"
        "license: apple-amlr\n"
        "pipeline_tag: image-text-to-text\n"
        "base_model: apple/FastVLM-0.5B\n"
        "---\n\n"
        "# Fieldwork FastVLM 0.5B ONNX\n\n"
        "Decoder fine-tuned on the Fieldwork headstone sample set. "
        "Vision encoder and token embeddings are copied from "
        f"`{PUBLIC_ONNX}`.\n",
        encoding="utf-8",
    )

    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)
    api.create_repo(REPO_ID, exist_ok=True, private=False)
    commit = api.upload_folder(
        folder_path=str(repo),
        repo_id=REPO_ID,
        commit_message="Publish sample-trained FastVLM ONNX",
    )
    revision = getattr(commit, "oid", None)
    print(f"[export] uploaded https://huggingface.co/{REPO_ID} {revision}")
    publish_manifest(revision)


if __name__ == "__main__":
    main()
