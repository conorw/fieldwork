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

**Local Browser Models** (PP-OCRv4/PP-OCRv2)
- Status: ✅ **Functional**
- OCR: PP-OCRv4 via Gutenye/ONNX (default, more accurate) or PP-OCRv2 via Paddle.js (fallback)
- Reasoning: Local text generation model (GPT-2)
- Accuracy: Good (PP-OCRv4 is more accurate than v2), improves with user corrections
- Speed: 10-15 seconds per analysis
- Requirements: 
  - WebGL/WebGPU support
  - PP-OCRv4: ~15-20MB model files (optional)
  - PP-OCRv2: Works immediately (~7-10MB)
- Privacy: All processing local, no data sent to servers
- Learning: User corrections collected for continuous improvement

### What Doesn't Work

**WebLLM Vision Models**
- Status: ❌ **Not functional**
- Reason: Vision models in WebLLM are not production-ready
- Issue: [WebLLM #727 - Vision models not working](https://github.com/mlc-ai/web-llm/issues/727)

---

### 4. PP-OCRv4/PP-OCRv2 + Local LLM (Current Implementation)

**Models Used:**
- PP-OCRv4 mobile (detection + recognition) via Gutenye/ONNX Runtime Web (default)
- PP-OCRv2 mobile (detection + recognition) via Paddle.js (fallback)
- `Xenova/gpt2` (text generation)

**Libraries:** 
- `@gutenye/ocr-browser` (PP-OCRv4, ONNX Runtime Web)
- `@paddlejs-models/ocr` (PP-OCRv2, Paddle.js)
- `@xenova/transformers` (text generation)

**Architecture:**
- Unified OCR service that tries PP-OCRv4 first, falls back to PP-OCRv2 if models unavailable
- PP-OCRv4 for text detection and recognition (provides bounding boxes + confidence scores)
- Text generation model for structured JSON output
- Feedback system for collecting user corrections

**Why It Works:**
- ✅ **Better OCR**: PP-OCRv4 is more accurate than PP-OCRv2, specifically designed for OCR tasks
- ✅ **Bounding Boxes**: Provides spatial information for better layout understanding
- ✅ **Confidence Scores**: Enables active learning by flagging low-confidence detections
- ✅ **Browser Compatible**: Both implementations work with WebGL/WebGPU/WebAssembly
- ✅ **Automatic Fallback**: Falls back to PP-OCRv2 if PP-OCRv4 models not available
- ✅ **Smaller Models**: PP-OCRv4 mobile optimized for browser deployment (~15-20MB)
- ✅ **Learning System**: User corrections collected for model fine-tuning

**PP-OCRv4 Benefits:**
- Better accuracy than PP-OCRv2
- Improved handling of complex layouts, rotated text, and rare characters
- Multilingual support (Chinese, English, Japanese, etc.)

**Limitations:**
- PP-OCRv4 requires model files to be downloaded/hosted (~15-20MB)
- Text generation model (GPT-2) is limited compared to larger models
- Requires model download on first use (for PP-OCRv4)

**Setup:**
- See [OCR Model Setup Guide](./OCR_MODEL_SETUP.md) for PP-OCRv4 model installation
- PP-OCRv2 works immediately without additional setup

**Code Location:**
- `src/services/ocrService.ts` - Unified OCR service (switches between PP-OCRv4 and PP-OCRv2)
- `src/services/gutenyeOCRService.ts` - PP-OCRv4 implementation via Gutenye/ONNX
- `src/services/paddleOCRService.ts` - PP-OCRv2 implementation via Paddle.js
- `src/services/localLLMService.ts` - Updated to use unified OCR service
- `src/services/ocrFeedbackService.ts` - Feedback collection
- `src/services/trainingDataService.ts` - Training data export
- `src/components/OCRCorrectionViewer.vue` - Correction UI

**Future Improvements:**
- Fine-tune PaddleOCR models on headstone-specific data
- Improve reasoning with better local LLMs as they become available
- Add PP-Structure for layout analysis
- Implement model versioning and A/B testing

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

Local browser-based AI for headstone analysis is **now viable** using PaddleOCR:

1. ✅ **PaddleOCR**: Better accuracy than TrOCR for engraved headstone text
2. ✅ **Browser Compatible**: Works with standard WebGL/WebGPU, no experimental features needed
3. ✅ **Learning System**: User corrections enable continuous model improvement
4. ⚠️ **Reasoning Limitations**: Text generation model (GPT-2) is limited but functional
5. ❌ **WebLLM Vision**: Still not viable due to experimental WebGPU requirements

**Current Recommendation:**
- **For Speed & Accuracy**: Use OpenAI API mode
- **For Privacy & Offline**: Use Local Browser Model (PaddleOCR)
- **For Continuous Improvement**: Use Local mode and contribute corrections

The **PaddleOCR approach provides a working local solution** with room for improvement through fine-tuning. The **OpenAI API mode remains the fastest and most accurate option** for production use.

**References:**
- [WebLLM Issue #727 - Vision Models Not Working](https://github.com/mlc-ai/web-llm/issues/727)
- [PaddleOCR Documentation](https://www.paddleocr.ai/)
- [Paddle.js Documentation](https://github.com/PaddlePaddle/Paddle.js)
- [Model Training Guide](./MODEL_TRAINING.md)

