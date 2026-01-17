# OCR Model Setup Guide

This guide explains how to set up PP-OCRv4 models for improved OCR accuracy in the browser.

## Overview

The Fieldwork app supports two OCR implementations:

1. **PP-OCRv2** (via Paddle.js) - Default, works out of the box
2. **PP-OCRv4** (via Gutenye/ONNX) - More accurate, requires model files

The app will automatically fallback to PP-OCRv2 if PP-OCRv4 models are not available.

## PP-OCRv4 Model Setup

To use PP-OCRv4 models for better accuracy, you need to download and place the following model files in the `public/models/` directory:

### Required Files

1. **Detection Model**: `ch_PP-OCRv4_det_infer.onnx`
2. **Recognition Model**: `ch_PP-OCRv4_rec_infer.onnx`
3. **Dictionary File**: `ppocr_keys_v1.txt`

### Download Links

You can download these files from:

- **PaddleOCR Official Repository**: https://github.com/PaddlePaddle/PaddleOCR
- **Hugging Face Models**: https://huggingface.co/models?search=paddleocr
- **Gutenye OCR Models**: Check the @gutenye/ocr-models package

### Directory Structure

After downloading, your `public/` directory should look like:

```
public/
├── models/
│   ├── ch_PP-OCRv4_det_infer.onnx
│   ├── ch_PP-OCRv4_rec_infer.onnx
│   └── ppocr_keys_v1.txt
├── icons/
├── fonts/
└── ...
```

### Model Sizes

- Detection model: ~4-5 MB
- Recognition model: ~10-12 MB
- Dictionary file: ~1-2 MB

Total: ~15-20 MB (will be cached by browser after first load)

## Using Custom Model Paths

You can specify custom model paths when initializing the OCR service:

```typescript
import { ocrService } from './services/ocrService';

await ocrService.initialize({
  detectionPath: '/custom/path/det.onnx',
  recognitionPath: '/custom/path/rec.onnx',
  dictionaryPath: '/custom/path/dict.txt',
});
```

## CDN Model Hosting

For production, consider hosting models on a CDN for faster loading:

```typescript
await ocrService.initialize({
  detectionPath: 'https://cdn.example.com/models/ch_PP-OCRv4_det_infer.onnx',
  recognitionPath: 'https://cdn.example.com/models/ch_PP-OCRv4_rec_infer.onnx',
  dictionaryPath: 'https://cdn.example.com/models/ppocr_keys_v1.txt',
});
```

## Fallback Behavior

If PP-OCRv4 models are not available or fail to load, the app will automatically fallback to PP-OCRv2 (Paddle.js), which works without additional setup.

## Performance Considerations

- **PP-OCRv4**: Better accuracy, slightly slower inference, requires model download
- **PP-OCRv4**: Uses ONNX Runtime Web (WebGL/WebGPU/WASM backends)
- **PP-OCRv2**: Faster inference, smaller bundle, works immediately

## Troubleshooting

### Models Not Loading

1. Check browser console for 404 errors
2. Verify model files are in `public/models/` directory
3. Ensure file names match exactly (case-sensitive)
4. Check CORS settings if using CDN

### Performance Issues

1. Models are cached after first load
2. Consider using quantized models for smaller size
3. Use WebGL backend for better performance (automatic)

### Accuracy Issues

1. Ensure you're using PP-OCRv4 models (not v2 or v3)
2. Check image preprocessing (contrast, resolution)
3. Consider fine-tuning models on your specific domain

## Next Steps

After setting up models, the app will automatically use PP-OCRv4 when available. You can verify which model is being used by checking the console logs:

```
UnifiedOCRService: Initializing Gutenye OCR (PP-OCRv4)...
```

vs

```
UnifiedOCRService: Initializing Paddle OCR (PP-OCRv2)...
```
