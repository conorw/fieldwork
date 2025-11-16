// Image processing service for hybrid storage approach
// Handles thumbnail/preview generation and cloud upload

export interface ImageProcessingResult {
  thumbnail: string;      // 200x200px, base64, stored in DB
  cloudUrl: string;       // Full resolution URL from Vercel storage
  metadata: {
    originalSize: number;
    thumbnailSize: number;
    dimensions: { width: number; height: number };
    format: string;
    fileName: string;
  };
}

export interface ImageMetadata {
  originalSize: number;
  thumbnailSize: number;
  dimensions: { width: number; height: number };
  format: string;
  fileName: string;
}

class ImageProcessingService {
  private readonly THUMBNAIL_SIZE = 200;
  private readonly THUMBNAIL_QUALITY = 0.8;
  private readonly MAX_UPLOAD_SIZE = 2 * 1024 * 1024; // 2MB max file size
  private readonly COMPRESSED_MAX_WIDTH = 1600;
  private readonly COMPRESSED_MAX_HEIGHT = 1600;
  private readonly COMPRESSED_QUALITY = 0.75;

  /**
   * Process an image file and create thumbnail
   */
  async processImage(file: File): Promise<ImageProcessingResult> {
    console.log('ImageProcessingService: Processing image:', file.name, file.size, 'bytes');

    try {
      // Validate file object
      if (!file) {
        throw new Error('File object is null or undefined');
      }

      if (!file.type || !file.type.startsWith('image/')) {
        throw new Error('Invalid file type. Please select an image file.');
      }

      if (!file.size || file.size === 0) {
        throw new Error('File is empty or has no size');
      }

      console.log('ImageProcessingService: File validation passed:', {
        name: file.name || 'unnamed',
        size: file.size,
        type: file.type
      });

      // 1. Create thumbnail (200x200)
      console.log('ImageProcessingService: Creating thumbnail...');
      const thumbnail = await this.createThumbnail(file, this.THUMBNAIL_SIZE, this.THUMBNAIL_QUALITY);

      // 2. Compress image if too large
      let processedFile = file;
      if (file.size > this.MAX_UPLOAD_SIZE) {
        console.log('ImageProcessingService: Image too large, compressing...');
        processedFile = await this.compressImage(file);
      }

      // 3. Upload to Vercel storage (with fallback)
      console.log('ImageProcessingService: Uploading to cloud storage...');
      let cloudUrl: string = '';
      try {
        cloudUrl = await this.uploadToVercelStorage(processedFile);
      } catch (uploadError) {
        console.warn('ImageProcessingService: Cloud upload failed:', uploadError);
      }

      // 3. Get image dimensions
      console.log('ImageProcessingService: Getting image dimensions...');
      const dimensions = await this.getImageDimensions(file);

      // 4. Convert thumbnail to base64
      console.log('ImageProcessingService: Converting to base64...');
      const thumbnailBase64 = await this.canvasToBase64(thumbnail);

      const result: ImageProcessingResult = {
        thumbnail: thumbnailBase64,
        cloudUrl,
        metadata: {
          originalSize: file.size,
          thumbnailSize: this.getBase64Size(thumbnailBase64),
          dimensions,
          format: file.type,
          fileName: file.name
        }
      };

      console.log('ImageProcessingService: Processing complete:', {
        originalSize: result.metadata.originalSize,
        thumbnailSize: result.metadata.thumbnailSize,
        compressionRatio: Math.round((1 - result.metadata.thumbnailSize / result.metadata.originalSize) * 100)
      });

      return result;

    } catch (error) {
      console.error('ImageProcessingService: Error processing image:', error);
      throw new Error(`Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a thumbnail from an image file
   */
  private async createThumbnail(file: File, size: number, _quality: number): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate dimensions maintaining aspect ratio
        const { width, height } = this.calculateDimensions(img.width, img.height, size, size);

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx!.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }



  /**
   * Compress an image to reduce file size
   */
  private async compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate dimensions maintaining aspect ratio
        const { width, height } = this.calculateDimensions(
          img.width, 
          img.height, 
          this.COMPRESSED_MAX_WIDTH, 
          this.COMPRESSED_MAX_HEIGHT
        );

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx!.drawImage(img, 0, 0, width, height);

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            
            // Convert blob to File
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            
            console.log(`ImageProcessingService: Compressed image from ${file.size} to ${compressedFile.size} bytes`);
            resolve(compressedFile);
          },
          'image/jpeg',
          this.COMPRESSED_QUALITY
        );
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Calculate dimensions maintaining aspect ratio
   */
  private calculateDimensions(originalWidth: number, originalHeight: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
    const aspectRatio = originalWidth / originalHeight;

    let width = maxWidth;
    let height = maxWidth / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = maxHeight * aspectRatio;
    }

    return { width: Math.round(width), height: Math.round(height) };
  }

  /**
   * Upload file to Vercel storage
   */
  private async uploadToVercelStorage(file: File): Promise<string> {
    try {
      // Validate file object
      if (!file) {
        throw new Error('File object is null or undefined');
      }

      // Create a unique filename with safe fallbacks
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);

      // Safely extract extension from filename
      let extension = 'jpg'; // Default fallback
      if (file.name && typeof file.name === 'string') {
        const nameParts = file.name.split('.');
        if (nameParts.length > 1) {
          extension = nameParts.pop() || 'jpg';
        }
      } else {
        // If no filename, try to determine from MIME type
        if (file.type) {
          if (file.type.includes('png')) extension = 'png';
          else if (file.type.includes('gif')) extension = 'gif';
          else if (file.type.includes('webp')) extension = 'webp';
          // Default to jpg for jpeg and unknown types
        }
      }

      const fileName = `plot-images/${timestamp}_${randomId}.${extension}`;

      console.log('ImageProcessingService: Uploading to Vercel storage:', fileName);
      console.log('ImageProcessingService: File details:', {
        name: file.name || 'unnamed',
        size: file.size || 0,
        type: file.type || 'unknown'
      });

      // Convert file to base64
      console.log('ImageProcessingService: Converting file to base64...');
      const fileData = await this.fileToBase64(file);
      console.log('ImageProcessingService: Base64 conversion successful, length:', fileData.length);

      // Upload to Vercel storage
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName,
          fileData
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ImageProcessingService: Upload response error:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('ImageProcessingService: Upload successful:', result.url);

      return result.url;
    } catch (error) {
      console.error('ImageProcessingService: Upload failed:', error);
      throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert file to base64
   */
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (!result || typeof result !== 'string') {
          reject(new Error('Failed to read file as base64'));
          return;
        }
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        if (!base64) {
          reject(new Error('Invalid base64 data format'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = (error) => {
        reject(new Error(`FileReader error: ${error}`));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert canvas to base64
   */
  private async canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  }

  /**
   * Get image dimensions
   */
  private async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Estimate base64 string size in bytes
   */
  private getBase64Size(base64: string): number {
    // Base64 adds ~33% overhead, so divide by 1.33
    return Math.round(base64.length * 0.75);
  }

  /**
   * Create a thumbnail from existing base64 data (for migration)
   */
  async createThumbnailFromBase64(base64Data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const { width, height } = this.calculateDimensions(img.width, img.height, this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE);

        canvas.width = width;
        canvas.height = height;
        ctx!.drawImage(img, 0, 0, width, height);

        const thumbnailBase64 = canvas.toDataURL('image/jpeg', this.THUMBNAIL_QUALITY).split(',')[1];
        resolve(thumbnailBase64);
      };
      img.onerror = reject;
      img.src = `data:image/jpeg;base64,${base64Data}`;
    });
  }

}

// Export singleton instance
export const imageProcessingService = new ImageProcessingService();
