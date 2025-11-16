# AI Analysis

Fieldwork includes AI-powered headstone analysis that automatically extracts person information from headstone photos. The system supports two analysis modes: OpenAI API (cloud-based) and Local Browser Model (privacy-focused, offline-capable).

## Overview

The AI analysis system:
- **Automatic Extraction**: Extracts names, dates, relationships from headstone photos
- **Structured Output**: Returns structured JSON with person data
- **Dual Modes**: Choose between OpenAI API or local browser model
- **Fast Processing**: Optimized for 8-10 second analysis times
- **High Accuracy**: Extracts full text transcriptions and structured data

## Analysis Modes

### OpenAI API Mode (Default)

**Best for**: Production use, fast analysis, reliable results

- **Model**: GPT-4o-mini (faster and cheaper than GPT-4o)
- **Speed**: 8-10 seconds per analysis
- **Accuracy**: High accuracy for text extraction
- **Requirements**: Internet connection, OpenAI API key
- **Cost**: Pay-per-use, very affordable with GPT-4o-mini
- **Privacy**: Images sent to OpenAI servers

**Configuration**:
- Set `OPENAI_API_KEY` in environment variables
- Select "OpenAI API" in Settings → AI Analysis Settings

### Local Browser Model

**Best for**: Privacy-focused use, offline capability, no API costs

- **Models**: 
  - OCR: `Xenova/trocr-small-printed` (text extraction)
  - Vision: `Xenova/vit-gpt2-image-captioning` (image understanding)
  - Text: `Xenova/gpt2` (structured output)
- **Speed**: 15-30 seconds per analysis (depends on device)
- **Accuracy**: Good accuracy, may vary by image quality
- **Requirements**: Initial model download (~100-200MB), works offline after
- **Cost**: Free (no API costs)
- **Privacy**: All processing happens in your browser

**Configuration**:
- Select "Local Browser Model" in Settings → AI Analysis Settings
- Models download automatically on first use
- Progress shown in Settings page

## How It Works

### Analysis Pipeline

```
Headstone Photo
    ↓
[Image Preprocessing] → Grayscale, contrast, sharpening
    ↓
[Text Extraction] → OCR or Vision model extracts text
    ↓
[Structured Generation] → Generate structured JSON
    ↓
[Parsing] → Parse and validate output
    ↓
[Person Records] → Create person records
```

### OpenAI Mode Flow

1. **Client Compression**: Image compressed to max 1024px (85% quality)
2. **API Request**: Sent to `/api/analyze-headstone`
3. **Server Compression**: Additional compression if needed (max 768px)
4. **OpenAI API**: Sent to GPT-4o-mini with structured output schema
5. **Response Parsing**: Parse structured JSON response
6. **Person Creation**: Create person records from extracted data

### Local Mode Flow

1. **Image Preprocessing**: Grayscale, contrast enhancement, sharpening
2. **OCR Extraction**: Extract text using TrOCR model
3. **Vision Description**: Get image description using vision model
4. **Text Combination**: Combine OCR and vision results
5. **Structured Generation**: Generate JSON using text model
6. **Parsing**: Parse and validate output
7. **Person Creation**: Create person records

## Extracted Data

### Person Information

The AI extracts:
- **Names**: Forename, surname, middle name, full name, known as, maiden name
- **Dates**: Date of birth, date of death, age at death, time of death
- **Relationships**: Spouse, children, family relationships
- **Personal Details**: Gender, marital status, veteran status
- **Location**: Birth/death locations, addresses
- **Epitaphs**: Memorial messages and quotes
- **Full Transcription**: Complete text from headstone

### Output Format

```typescript
{
  success: true,
  persons: [
    {
      forename: "John",
      surname: "Smith",
      full_name: "John Smith",
      date_of_birth: "1950-01-15",
      date_of_death: "2020-03-20",
      age_at_death: 70,
      // ... other fields
    }
  ],
  full_text_transcription: "In Loving Memory\nJohn Smith\n1950-2020\nBeloved Husband and Father",
  metadata: {
    analysis_timestamp: "2024-01-15T10:30:00Z",
    model_used: "gpt-4o-mini" | "local",
    confidence_level: "high" | "medium"
  }
}
```

## Image Optimization

### Client-Side Compression

Before analysis, images are compressed:
- **Target Size**: Max 1024px on longest side
- **Quality**: 85% JPEG quality
- **Format**: JPEG (for consistency)
- **Purpose**: Reduce API tokens and speed up processing

### Server-Side Compression

Additional compression on server (if needed):
- **Target Size**: Max 768px (safety net)
- **Quality**: 85% JPEG quality
- **Threshold**: Only if image > 100KB after client compression

## Performance Optimization

### OpenAI Optimizations

1. **Model Selection**: GPT-4o-mini (2-3x faster than GPT-4o)
2. **Image Compression**: Reduces token usage significantly
3. **Structured Output**: More reliable than text parsing
4. **Optimized Prompts**: Shorter prompts for faster processing
5. **Low Detail**: Uses `detail: 'low'` for image processing

### Local Model Optimizations

1. **Image Preprocessing**: Enhances text visibility
2. **Hybrid Approach**: Combines OCR and vision models
3. **Garbled Text Detection**: Falls back to vision if OCR fails
4. **Efficient Models**: Uses smaller, faster models

## Usage

### Analyzing a Headstone

1. **Add Image**: Upload headstone photo when creating/editing plot
2. **Select Mode**: Choose analysis mode in Settings (if not already set)
3. **Automatic Analysis**: Analysis starts automatically
4. **Review Results**: Review extracted data in the form
5. **Edit if Needed**: Make corrections if needed
6. **Save**: Save person records

### Switching Modes

1. **Go to Settings**: Navigate to Settings page
2. **AI Analysis Settings**: Open AI Analysis Settings section
3. **Select Mode**: Choose OpenAI API or Local Browser Model
4. **Wait for Download**: If switching to local, wait for model download
5. **Ready**: Mode is active for next analysis

## Model Management (Local Mode)

### Model Download

- **Automatic**: Models download when switching to local mode
- **Progress**: Download progress shown in Settings
- **Caching**: Models cached by browser (IndexedDB)
- **Size**: ~100-200MB total for all models

### Model State

The app tracks model state:
- **Not Loaded**: Models not yet downloaded
- **Loading**: Models downloading (progress shown)
- **Loaded**: Models ready for use
- **Error**: Download or loading error

### Model Information

- **OCR Model**: `Xenova/trocr-small-printed` (~50MB)
- **Vision Model**: `Xenova/vit-gpt2-image-captioning` (~200MB)
- **Text Model**: `Xenova/gpt2` (~50MB)

## Error Handling

### OpenAI Errors

- **API Key Missing**: Check environment variables
- **Rate Limiting**: Wait and retry
- **Network Error**: Check internet connection
- **Invalid Image**: Ensure image is valid format

### Local Model Errors

- **Model Not Found**: Check internet for initial download
- **Network Error**: Required for model download
- **Tokenizer Error**: Model compatibility issue
- **Memory Error**: Device may not have enough memory

## Best Practices

### For Best Results

1. **Good Photos**: Clear, well-lit photos work best
2. **Straight Angle**: Photograph headstone straight-on
3. **Good Lighting**: Ensure text is clearly visible
4. **High Resolution**: Higher resolution helps (but will be compressed)
5. **Review Results**: Always review and correct extracted data

### For Performance

1. **Use OpenAI for Speed**: OpenAI mode is faster
2. **Use Local for Privacy**: Local mode keeps data private
3. **Compress Before Upload**: Client-side compression helps
4. **Batch Analysis**: Analyze multiple headstones in sequence

## Troubleshooting

### Analysis Not Working

1. **Check Mode**: Verify analysis mode is set correctly
2. **Check API Key**: Ensure OpenAI API key is set (for OpenAI mode)
3. **Check Models**: Ensure local models are loaded (for local mode)
4. **Check Network**: Ensure internet connection (for OpenAI or model download)
5. **Check Console**: Look for error messages in browser console

### Poor Extraction Quality

1. **Image Quality**: Ensure photo is clear and well-lit
2. **Image Angle**: Photograph headstone straight-on
3. **Text Visibility**: Ensure text is clearly visible
4. **Try Different Mode**: Switch between OpenAI and local mode
5. **Manual Correction**: Always review and correct extracted data

### Slow Analysis

1. **OpenAI Mode**: Use OpenAI mode for faster analysis
2. **Image Size**: Smaller images process faster
3. **Network Speed**: Faster network = faster analysis
4. **Device Performance**: Local mode depends on device performance

## Related Documentation

- [Photo Handling](./PHOTO_HANDLING.md) - Image processing and storage
- [Offline Data](./OFFLINE_DATA.md) - Data storage and sync
- [Main README](../README.md) - General application documentation

