# Photo Handling

Fieldwork uses a hybrid storage approach for images: thumbnails stored locally in the database, full-resolution images stored in cloud storage (Vercel Blob Storage). This provides fast loading while minimizing local storage usage.

## Overview

The photo handling system:
- **Automatic Compression**: Images are compressed before upload
- **Thumbnail Generation**: 200x200px thumbnails for quick previews
- **Cloud Storage**: Full-resolution images stored in Vercel Blob Storage
- **Client-Side Processing**: Compression happens in the browser before upload
- **Optimized Uploads**: Only compressed images are sent to the server

## Image Processing Pipeline

### 1. Client-Side Compression

When you upload a photo:

1. **Validation**: Checks file type and size
2. **Thumbnail Creation**: Generates 200x200px thumbnail
3. **Compression**: Compresses images larger than 2MB
4. **Base64 Conversion**: Converts thumbnail to base64 for database storage

### 2. Processing Steps

```
Original Image
    ↓
[Validation] → Check file type, size
    ↓
[Thumbnail] → Create 200x200px thumbnail (80% quality)
    ↓
[Compression] → If > 2MB, resize to max 1600x1600px (75% quality)
    ↓
[Upload] → Upload compressed image to Vercel Blob Storage
    ↓
[Storage] → Store thumbnail in database, cloud URL in database
```

### 3. Storage Strategy

**Thumbnails** (stored in database):
- Size: 200x200px
- Format: JPEG, 80% quality
- Storage: Base64 string in `plot_images.thumbnail_data`
- Purpose: Fast loading in lists and previews

**Full Images** (stored in cloud):
- Size: Original or compressed (max 1600x1600px)
- Format: JPEG, 75% quality (if compressed)
- Storage: Vercel Blob Storage
- URL: Stored in `plot_images.cloud_url`
- Purpose: Full-resolution viewing

## Image Processing Service

### Configuration

```typescript
THUMBNAIL_SIZE = 200          // Thumbnail dimensions (px)
THUMBNAIL_QUALITY = 0.8       // Thumbnail JPEG quality
MAX_UPLOAD_SIZE = 2MB         // Compression threshold
COMPRESSED_MAX_WIDTH = 1600   // Max width after compression
COMPRESSED_MAX_HEIGHT = 1600  // Max height after compression
COMPRESSED_QUALITY = 0.75      // Compressed image quality
```

### Usage

```typescript
import { imageProcessingService } from './utils/imageProcessingService'

// Process an image file
const result = await imageProcessingService.processImage(file)

// Result contains:
{
  thumbnail: string,        // Base64 thumbnail
  cloudUrl: string,        // Full image URL
  metadata: {
    originalSize: number,
    thumbnailSize: number,
    dimensions: { width, height },
    format: string,
    fileName: string
  }
}
```

## Headstone Analysis Compression

For headstone analysis, additional client-side compression is applied:

### Analysis-Specific Compression

- **Target Size**: Max 1024px on longest side
- **Quality**: 85% JPEG quality
- **Purpose**: Reduce API token usage and speed up analysis
- **Format**: Always JPEG for consistency

This compression happens in `headstoneAnalysisService.ts` before sending to the API.

## Database Schema

### Plot Images Table

```sql
plot_images (
  id: string
  plot_id: string
  file_name: string
  thumbnail_data: string      -- Base64 thumbnail
  cloud_url: string          -- Full image URL
  original_size: number      -- Original file size (bytes)
  thumbnail_size: number     -- Thumbnail size (bytes)
  dimensions: json           -- { width, height }
  format: string             -- MIME type
  date_created: timestamp
  created_by: string
)
```

### Person Images Table

Similar structure for person photos:
- Thumbnails stored locally
- Full images in cloud storage
- Same compression pipeline

## Cloud Storage

### Vercel Blob Storage

- **Provider**: Vercel Blob Storage
- **Path**: `plot-images/{timestamp}_{randomId}.{ext}`
- **Access**: Public URLs for full-resolution images
- **CDN**: Automatically served via CDN for fast delivery

### Upload Process

1. **Convert to Base64**: Image is converted to base64
2. **API Call**: POST to `/api/upload-image`
3. **Server Processing**: Server uploads to Vercel Blob Storage
4. **Return URL**: Public URL is returned and stored

## Performance Optimizations

### Client-Side Compression

- **Reduces Upload Time**: Smaller files upload faster
- **Reduces Bandwidth**: Less data transferred
- **Faster Analysis**: Smaller images = faster AI processing
- **Better UX**: Users see progress faster

### Thumbnail Strategy

- **Fast Loading**: Thumbnails load instantly from database
- **Low Storage**: ~10-20KB per thumbnail vs MB for full images
- **Offline Access**: Thumbnails available offline
- **Bandwidth Savings**: Only load full images when needed

### Lazy Loading

- **Thumbnails First**: Show thumbnails immediately
- **Full Image on Demand**: Load full image when user clicks
- **Progressive Enhancement**: Better experience on slow connections

## Offline Support

### Thumbnails

- **Always Available**: Stored in local database
- **Offline Viewing**: Can view thumbnails without internet
- **Fast Access**: No network request needed

### Full Images

- **Requires Internet**: Full images need cloud access
- **Caching**: Browser may cache viewed images
- **Fallback**: Show thumbnail if full image unavailable

## Image Migration

For existing images without thumbnails:

1. **Migration Service**: `imageMigrationService.ts`
2. **Batch Processing**: Processes images in batches
3. **Progress Tracking**: Shows migration progress
4. **Error Handling**: Continues on individual failures

## Best Practices

### For Users

1. **Use Good Photos**: Clear, well-lit photos work best
2. **Reasonable Size**: Very large photos (>10MB) may take longer
3. **Wait for Upload**: Let images finish uploading before leaving
4. **Check Thumbnails**: Verify thumbnails appear correctly

### For Developers

1. **Error Handling**: Always handle upload failures gracefully
2. **Progress Indicators**: Show upload progress to users
3. **Validation**: Validate file types and sizes before processing
4. **Cleanup**: Clean up object URLs after use

## Troubleshooting

### Images Not Uploading

1. **Check File Size**: Very large files may timeout
2. **Check Network**: Ensure internet connection is stable
3. **Check Browser Console**: Look for error messages
4. **Check Storage Quota**: Ensure Vercel Blob Storage has space

### Thumbnails Not Showing

1. **Check Database**: Verify `thumbnail_data` is populated
2. **Check Base64**: Ensure base64 string is valid
3. **Check Image Format**: Verify image format is supported
4. **Clear Cache**: Try clearing browser cache

### Slow Uploads

1. **Check Image Size**: Large images take longer
2. **Check Compression**: Ensure compression is working
3. **Check Network**: Slow connections affect upload speed
4. **Check Server**: Verify Vercel Blob Storage is responsive

## Related Documentation

- [Offline Data](./OFFLINE_DATA.md) - Database storage and sync
- [AI Analysis](./AI.md) - Image analysis features
- [Main README](../README.md) - General application documentation

