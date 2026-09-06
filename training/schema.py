"""
Frozen target schema for per-cemetery VLM training.
Keep in sync with src/types/headstoneTraining.ts
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional

StoneType = Literal[
    "single",
    "couple",
    "family",
    "kerb",
    "ledger",
    "cross",
    "child",
    "war",
    "weathered",
    "unknown",
]

PersonPosition = Literal[
    "left", "right", "upper", "lower", "shared", "center", "unknown"
]
PersonRole = Literal["primary", "spouse", "child", "parent", "other"]

MIN_TRAINING_EXAMPLES = 15

# Prompt the VLM sees during train + (future) local inference
REASONING_PROMPT = (
    "Look at this headstone. Reason about each deceased person using layout "
    "(left/right, upper/lower), relationships, and date blocks. "
    "Return ONLY valid JSON matching the cemetery reasoning schema."
)

BASE_MODEL_ID = "apple/FastVLM-0.5B"


@dataclass
class DatesTarget:
    birth: str = ""
    death: str = ""
    aged: Optional[float] = None


@dataclass
class PersonTarget:
    full_name: str
    role_on_stone: PersonRole = "primary"
    position: PersonPosition = "unknown"
    evidence: str = ""
    title: str = ""
    forename: str = ""
    middle_name: str = ""
    surname: str = ""
    maiden_name: str = ""
    known_as: str = ""
    dates: DatesTarget = field(default_factory=DatesTarget)
    relationships: list[str] = field(default_factory=list)
    veteran: bool = False


@dataclass
class SharedTarget:
    surname: str = ""
    epitaph: str = ""


@dataclass
class ReasoningTarget:
    people: list[PersonTarget] = field(default_factory=list)
    shared: SharedTarget = field(default_factory=SharedTarget)
    notes: str = ""


@dataclass
class TrainingExample:
    location_id: str
    image_url: str
    stone_type: StoneType
    target: ReasoningTarget
    plot_id: Optional[str] = None
    plot_image_id: Optional[str] = None


@dataclass
class TrainJobPayload:
    locationId: str
    version: str
    examples: list[dict[str, Any]]
    webhookUrl: str


def target_to_json(target: ReasoningTarget | dict[str, Any]) -> str:
    if isinstance(target, ReasoningTarget):
        return json.dumps(asdict(target), ensure_ascii=False)
    return json.dumps(target, ensure_ascii=False)


def parse_payload(raw: str | dict[str, Any]) -> TrainJobPayload:
    data = json.loads(raw) if isinstance(raw, str) else raw
    return TrainJobPayload(
        locationId=data["locationId"],
        version=data["version"],
        examples=data["examples"],
        webhookUrl=data["webhookUrl"],
    )


def example_to_jsonl_row(location_id: str, ex: dict[str, Any]) -> dict[str, Any]:
    return {
        "location_id": location_id,
        "image_url": ex["imageUrl"],
        "stone_type": ex.get("stoneType", "unknown"),
        "target": ex["target"],
        "plot_id": ex.get("plotId"),
        "plot_image_id": ex.get("plotImageId"),
    }
