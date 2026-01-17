# Model Training Guide

This guide explains how to fine-tune PaddleOCR models using collected OCR corrections from the Fieldwork application.

## Overview

The Fieldwork app collects OCR corrections from users, which can be used to fine-tune PP-OCR models for better accuracy on headstone images. This guide covers:

1. Exporting training data from the app
2. Preparing data for PaddleOCR training
3. Fine-tuning detection and recognition models
4. Converting models for browser deployment
5. Deploying updated models

## Prerequisites

- Python 3.8+
- PaddleOCR installed (`pip install paddlepaddle paddleocr`)
- GPU recommended (but not required for small datasets)
- Collected corrections in the app (recommended: 500+ detection samples, 5000+ recognition samples)

## Step 1: Export Training Data

### From the Browser App

1. Open the OCR Correction Viewer component
2. Click "Export Training Data"
3. The app will export:
   - Detection annotations (JSON format)
   - Recognition labels (TSV format)
   - Metadata (JSON format)

### Using the Training Data Service

```typescript
import { ocrFeedbackService } from '../services/ocrFeedbackService';
import { trainingDataService } from '../services/trainingDataService';

// Get all corrections
const corrections = await ocrFeedbackService.getAllCorrections();

// Export as training dataset
const dataset = await trainingDataService.exportTrainingDataset(corrections, true);

// Export as files
const files = await trainingDataService.exportAsFiles(corrections, true);
```

### Data Format

**Detection Format** (JSON lines):
```json
{"image_path": "headstone_img-abc123.jpg", "annotations": [{"bbox": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], "text": "JOHN SMITH", "difficult": false}]}
```

**Recognition Format** (TSV):
```
img-abc123_crop_0.jpg	JOHN SMITH
img-abc123_crop_1.jpg	1950 - 2020
```

## Step 2: Prepare Training Data

### Directory Structure

Create the following directory structure:

```
training_data/
├── detection/
│   ├── images/
│   │   ├── headstone_img-abc123.jpg
│   │   └── ...
│   └── train_det.txt  # Detection annotations
├── recognition/
│   ├── images/
│   │   ├── img-abc123_crop_0.jpg
│   │   └── ...
│   └── train_rec.txt  # Recognition labels
└── configs/
    ├── det_config.yml
    └── rec_config.yml
```

### Convert Detection Format

Convert exported JSON to PaddleOCR detection format:

```python
import json

def convert_detection_format(input_file, output_file, images_dir):
    """Convert JSON lines to PaddleOCR detection format"""
    with open(input_file, 'r') as f_in, open(output_file, 'w') as f_out:
        for line in f_in:
            data = json.loads(line)
            image_path = f"{images_dir}/{data['image_path']}"
            for ann in data['annotations']:
                # Format: image_path\t[{"transcription": "text", "points": [[x1,y1],...]}]
                points_str = json.dumps(ann['bbox'])
                transcription = ann['text']
                difficult = "1" if ann.get('difficult', False) else "0"
                f_out.write(f"{image_path}\t[{{\"transcription\": \"{transcription}\", \"points\": {points_str}}}]}\t{difficult}\n")
```

### Prepare Recognition Data

Recognition data is already in TSV format. Ensure images are cropped and saved:

```python
import base64
from PIL import Image
import io

def save_cropped_images(dataset_json, output_dir):
    """Extract and save cropped images from dataset"""
    with open(dataset_json, 'r') as f:
        dataset = json.load(f)
    
    for rec_data in dataset['recognition']:
        if rec_data.get('image_data'):
            # Decode base64 image
            img_data = base64.b64decode(rec_data['image_data'].split(',')[1])
            img = Image.open(io.BytesIO(img_data))
            
            # Save cropped image
            output_path = f"{output_dir}/{rec_data['image_path']}"
            img.save(output_path)
```

## Step 3: Fine-tune Detection Model

### Configuration

Create `configs/det_config.yml`:

```yaml
Global:
  use_gpu: true
  epoch_num: 100
  log_smooth_window: 20
  print_batch_step: 10
  save_model_dir: ./output/det_model/
  save_epoch_step: 10
  eval_batch_step: 500
  cal_metric_during_train: true
  pretrained_model: ./pretrain_models/en_PP-OCRv3_det_distill_train.tar
  checkpoints: null
  use_visualdl: false
  infer_img: doc/imgs_en/img_10.jpg
  save_inference_dir: null
  use_dilation: false
  save_res_path: ./output/det/predicts_db.txt

Train:
  dataset:
    name: SimpleDataSet
    data_dir: ./training_data/detection/
    label_file_list:
      - ./training_data/detection/train_det.txt
    ratio_list: [1.0]
    transforms:
      - DecodeImage:
          img_mode: BGR
          channel_first: false
      - DetLabelEncode: null
      - DetResizeForTest:
          image_shape: [736, 1280]
      - NormalizeImage:
          scale: 1./255.
          mean: [0.485, 0.456, 0.406]
          std: [0.229, 0.224, 0.225]
          order: 'hwc'
      - ToCHWImage: null
      - KeepKeys:
          keep_keys: ['image', 'shape', 'polys', 'ignore_tags']
  loader:
    shuffle: true
    batch_size_per_card: 8
    drop_last: false
    num_workers: 4

Eval:
  dataset:
    name: SimpleDataSet
    data_dir: ./training_data/detection/
    label_file_list:
      - ./training_data/detection/eval_det.txt
    transforms:
      - DecodeImage:
          img_mode: BGR
          channel_first: false
      - DetLabelEncode: null
      - DetResizeForTest:
          image_shape: [736, 1280]
      - NormalizeImage:
          scale: 1./255.
          mean: [0.485, 0.456, 0.406]
          std: [0.229, 0.224, 0.225]
          order: 'hwc'
      - ToCHWImage: null
      - KeepKeys:
          keep_keys: ['image', 'shape', 'polys', 'ignore_tags']
  loader:
    shuffle: false
    drop_last: false
    batch_size_per_card: 1
    num_workers: 2
```

### Training Command

```bash
python tools/train.py -c configs/det_config.yml
```

## Step 4: Fine-tune Recognition Model

### Configuration

Create `configs/rec_config.yml`:

```yaml
Global:
  use_gpu: true
  epoch_num: 100
  log_smooth_window: 20
  print_batch_step: 10
  save_model_dir: ./output/rec_model/
  save_epoch_step: 10
  eval_batch_step: 500
  cal_metric_during_train: true
  pretrained_model: ./pretrain_models/en_PP-OCRv3_rec_train.tar
  checkpoints: null
  use_visualdl: false
  infer_img: doc/imgs_words/en/word_1.png
  character_dict_path: ppocr/utils/en_dict.txt
  use_space_char: true
  save_inference_dir: null

Train:
  dataset:
    name: SimpleDataSet
    data_dir: ./training_data/recognition/
    label_file_list:
      - ./training_data/recognition/train_rec.txt
    ratio_list: [1.0]
    transforms:
      - DecodeImage:
          img_mode: BGR
          channel_first: false
      - RecConAug:
          prob: 0.5
          ext_data_num: 2
          image_shape: [48, 320, 3]
          max_text_length: 25
      - RecAug: null
      - MultiLabelEncode: null
      - RecResizeImg:
          image_shape: [3, 48, 320]
      - KeepKeys:
          keep_keys: ['image', 'label', 'length']
  loader:
    shuffle: true
    batch_size_per_card: 256
    drop_last: true
    num_workers: 8

Eval:
  dataset:
    name: SimpleDataSet
    data_dir: ./training_data/recognition/
    label_file_list:
      - ./training_data/recognition/eval_rec.txt
    transforms:
      - DecodeImage:
          img_mode: BGR
          channel_first: false
      - MultiLabelEncode: null
      - RecResizeImg:
          image_shape: [3, 48, 320]
      - KeepKeys:
          keep_keys: ['image', 'label', 'length']
  loader:
    shuffle: false
    drop_last: false
    batch_size_per_card: 256
    num_workers: 4
```

### Training Command

```bash
python tools/train.py -c configs/rec_config.yml
```

## Step 5: Export Inference Models

After training, export models for inference:

### Export Detection Model

```bash
python tools/export_model.py \
  -c configs/det_config.yml \
  -o Global.pretrained_model=./output/det_model/best_accuracy \
  Global.save_inference_dir=./inference/det_model
```

### Export Recognition Model

```bash
python tools/export_model.py \
  -c configs/rec_config.yml \
  -o Global.pretrained_model=./output/rec_model/best_accuracy \
  Global.save_inference_dir=./inference/rec_model
```

## Step 6: Convert for Browser Deployment

### Using Paddle2ONNX

Convert Paddle models to ONNX format:

```bash
# Install paddle2onnx
pip install paddle2onnx

# Convert detection model
paddle2onnx \
  --model_dir ./inference/det_model \
  --model_filename inference.pdmodel \
  --params_filename inference.pdiparams \
  --save_file ./onnx/det_model.onnx \
  --opset_version 11

# Convert recognition model
paddle2onnx \
  --model_dir ./inference/rec_model \
  --model_filename inference.pdmodel \
  --params_filename inference.pdiparams \
  --save_file ./onnx/rec_model.onnx \
  --opset_version 11
```

### Using Paddle.js Converter

If using Paddle.js directly:

1. Use Paddle.js model transformation tools
2. Convert models to Paddle.js format (model.json + .dat files)
3. Host models on CDN or include in app bundle

## Step 7: Deploy Updated Models

1. **Version Models**: Tag models with version numbers (e.g., `ppocrv3-mobile-v1.1`)
2. **Update Service**: Update `paddleOCRService.ts` to load new model version
3. **Test**: Verify improved accuracy on test headstone images
4. **Deploy**: Update model URLs/CDN paths in the app
5. **Monitor**: Track accuracy metrics and user corrections

## Best Practices

### Data Collection

- **Minimum Samples**: Aim for 500+ detection samples and 5,000+ recognition samples
- **Diversity**: Collect samples from various headstone types, fonts, and conditions
- **Quality**: Focus on low-confidence detections for active learning
- **Validation**: Split data into train/eval sets (80/20 recommended)

### Training Tips

- **Learning Rate**: Start with low learning rate (1e-4) for fine-tuning
- **Batch Size**: Adjust based on GPU memory (8-16 for detection, 256+ for recognition)
- **Epochs**: Monitor validation loss to avoid overfitting
- **Augmentation**: Use PaddleOCR's built-in augmentation for better generalization

### Model Evaluation

- **Metrics**: Track Character Error Rate (CER) and Word Error Rate (WER)
- **Test Set**: Maintain held-out test set for unbiased evaluation
- **Comparison**: Compare fine-tuned model vs baseline on same test set
- **Ablation**: Test individual improvements (detection vs recognition)

## Troubleshooting

### Common Issues

1. **Out of Memory**: Reduce batch size or image resolution
2. **Poor Convergence**: Lower learning rate or check data quality
3. **Overfitting**: Increase data augmentation or reduce model capacity
4. **Export Errors**: Ensure model files are complete and paths are correct

### Getting Help

- PaddleOCR Documentation: https://github.com/PaddlePaddle/PaddleOCR
- Paddle.js Documentation: https://github.com/PaddlePaddle/Paddle.js
- Fieldwork Issues: Report issues in the project repository

## Next Steps

After fine-tuning:

1. **Continuous Learning**: Set up periodic retraining with new corrections
2. **A/B Testing**: Compare model versions with users
3. **Monitoring**: Track accuracy metrics over time
4. **Iteration**: Use feedback to guide further improvements
