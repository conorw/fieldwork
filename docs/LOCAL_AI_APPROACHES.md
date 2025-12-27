# Local AI Approaches for Headstone Analysis

This document details the various approaches attempted to implement local (browser-based) AI for headstone text extraction and analysis, the models used, and why each approach didn't work out.

## Overview

The goal was to create a fully local, privacy-preserving solution for analyzing headstone images that could work offline without sending data to external APIs. Multiple approaches were attempted using different model architectures and libraries, but all encountered significant limitations.

## Approaches Attempted

### 1. TrOCR (Transformer-based OCR) + WebLLM

**Models Used:**
- `Xenova/trocr-base-printed` (initial attempt)
- `Xenova/trocr-base-handwritten` (fallback attempt)

**Library:** `@xenova/transformers` (Transformers.js)

**Architecture:**
- TrOCR model for text extraction from images
- WebLLM (`Llama-3.2-1B-Instruct-q4f16_1-MLC`) for structured JSON generation from extracted text

**Why It Didn't Work:**
- **Wrong use case**: TrOCR models are trained on printed documents and handwritten text, not engraved headstones
- **Poor accuracy**: Extracted nonsensical text like "ITEM TOTAL..." instead of actual headstone inscriptions
- **Model limitations**: TrOCR struggles with:
  - Weathered/eroded engraved text
  - Ornate fonts common on headstones
  - Shadow effects from engraved text
  - Low contrast between text and stone

**Code Location:** 
- Removed from `src/services/localLLMService.ts`
- Test utilities removed: `src/utils/testTrOCR.ts`, `src/components/VisionTest.vue`

---

### 2. Vision-Language Models (Image Captioning)

**Models Used:**
- `Xenova/vit-gpt2-image-captioning`

**Library:** `@xenova/transformers` (Transformers.js)

**Architecture:**
- Vision-language model for image understanding
- WebLLM for structured output generation

**Why It Didn't Work:**
- **Wrong task**: Image captioning models describe images, they don't extract text
- **No text extraction**: The model would say "a headstone with text" rather than reading the actual text
- **Not designed for OCR**: These models are for image understanding, not text recognition

**Code Location:**
- Removed from `src/services/localLLMService.ts`
- Test component removed: `src/components/VisionTest.vue` (was renamed from `OCRTest.vue`)

---

### 3. Phi-3.5-Vision-Instruct (WebLLM Vision Model)

**Models Used:**
- `Phi-3.5-vision-instruct-q4f16_1-MLC` (primary)
- `Phi-3.5-vision-instruct-q4f32_1-MLC` (fallback attempt)

**Library:** `@mlc-ai/web-llm` (WebLLM)

**Architecture:**
- Single vision-language model that processes images directly and generates structured output
- No separate OCR step needed - the model understands both vision and language

**Why It Didn't Work:**
- **WebGPU compatibility issues**: The model requires experimental WebGPU features that aren't available in standard browsers
- **Shader errors**: Model library compiled with `chromium_experimental_subgroup_matrix` extension requirement
- **Browser limitations**: Error: `'u8' type used without 'chromium_experimental_subgroup_matrix' extension enabled`
- **Known issues**: According to [WebLLM issue #727](https://github.com/mlc-ai/web-llm/issues/727), vision models in WebLLM are not production-ready and have multiple known problems:
  - Cache/parameter errors
  - WebAssembly import errors
  - Model library version mismatches
  - Even self-compiled models fail

**Error Details:**
```
Error while parsing WGSL: :4:68 error: 'u8' type used without 'chromium_experimental_subgroup_matrix' extension enabled
@group(0) @binding(0) var<storage, read_write> T_transpose : array<u8>;
```

**Code Location:**
- `src/services/localLLMService.ts` (currently attempts to load but fails due to browser compatibility)

---

## Current State

### What Works

**OpenAI API Mode** (default, recommended)
- Model: `gpt-4o-mini`
- Status: ✅ **Fully functional**
- Accuracy: High - specifically designed for vision tasks
- Speed: 8-10 seconds per analysis
- Requirements: Internet connection, OpenAI API key
- Privacy: Images sent to OpenAI servers

### What Doesn't Work

**Local Browser Models**
- Status: ❌ **Not functional**
- Reason: Vision models in WebLLM are not production-ready
- Issue: [WebLLM #727 - Vision models not working](https://github.com/mlc-ai/web-llm/issues/727)

---

## Future Viability

The **Phi-3.5-vision-instruct approach** is the most promising architecture for local headstone analysis, but it will only be viable when:

1. **WebLLM vision models mature**: The [WebLLM vision model issues](https://github.com/mlc-ai/web-llm/issues/727) are resolved
2. **Browser support improves**: Experimental WebGPU features become standard
3. **Model libraries stabilize**: WASM compilation issues are fixed

### Why Phi-3.5-Vision is the Right Approach

- **Single model**: Handles both vision and language understanding
- **Context-aware**: Understands what it's looking at (headstone), not just extracting text
- **Better accuracy**: Designed for vision-language tasks, not just OCR
- **Structured output**: Can generate JSON directly from images

### Current Blockers

1. **WebGPU experimental features**: Model requires `chromium_experimental_subgroup_matrix` extension
2. **Model library issues**: Multiple known bugs in WebLLM vision model support
3. **Browser compatibility**: Even with WebGPU, experimental extensions aren't available

---

## Recommendations

### For Production Use

**Use OpenAI API mode** - It's the only reliable option currently:
- High accuracy
- Fast processing
- Well-tested and stable
- Cost-effective with `gpt-4o-mini`

### For Future Local Implementation

**Monitor WebLLM progress:**
- Watch [issue #727](https://github.com/mlc-ai/web-llm/issues/727) for vision model fixes
- Check WebLLM releases for vision model improvements
- Test again when experimental WebGPU features become standard

**Alternative considerations:**
- Wait for other vision-language models to be ported to WebLLM
- Consider server-side local models if privacy is critical (but defeats browser-only goal)
- Use hybrid approach: OCR preprocessing + better text models (but TrOCR accuracy is too poor)

---

## Technical Details

### Model Specifications

**TrOCR Models:**
- Architecture: Transformer-based OCR
- Training: Printed/handwritten documents
- Task: Text extraction from images
- Limitations: Not suitable for engraved/weathered text

**Vision-Language Models:**
- Architecture: Vision encoder + language decoder
- Training: Image captioning datasets
- Task: Image understanding and description
- Limitations: Don't extract text, only describe images

**Phi-3.5-Vision-Instruct:**
- Architecture: Vision-language model
- Training: Multimodal datasets
- Task: Vision + language understanding + structured output
- Limitations: Requires experimental WebGPU features, WebLLM support not stable

### Library Versions

- `@xenova/transformers`: Latest (Transformers.js)
- `@mlc-ai/web-llm`: Latest (WebLLM)
- WebGPU: Requires experimental features not in standard browsers

---

## Conclusion

Local browser-based AI for headstone analysis is **not currently viable** due to:

1. **TrOCR limitations**: Wrong model type for engraved headstones
2. **Vision model immaturity**: WebLLM vision models have known issues and require experimental browser features
3. **Browser compatibility**: Experimental WebGPU extensions not available in standard browsers

The **OpenAI API mode remains the recommended approach** until WebLLM vision models mature and browser support for required WebGPU features becomes standard.

**Reference:** [WebLLM Issue #727 - Vision Models Not Working](https://github.com/mlc-ai/web-llm/issues/727)

