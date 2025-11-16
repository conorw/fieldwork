// API endpoint for uploading images to Vercel storage
import { put } from '@vercel/blob';
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // Parse the request body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { fileName, fileData } = body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Missing fileName or fileData' });
    }

    console.log('Upload API: Uploading image:', fileName);
    console.log('Upload API: File data length:', fileData.length);

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');
    console.log('Upload API: Buffer size:', buffer.length);

    // Check if we're in development mode or if Vercel Blob is not configured
    if (process.env.NODE_ENV === 'development' || !process.env.BLOB_READ_WRITE_TOKEN) {
      console.log('Upload API: Development mode - returning mock URL');
      // Return a mock URL for development
      return res.status(200).json({
        url: `https://mock-storage.dev/images/${fileName}`,
        fileName: fileName,
        size: buffer.length
      });
    }

    // Upload to Vercel storage
    console.log('Upload API: Uploading to Vercel Blob storage...');
    const blob = await put(fileName, buffer, {
      access: 'public',
      contentType: 'image/jpeg'
    });

    console.log('Upload API: Upload successful:', blob.url);

    return res.status(200).json({
      url: blob.url,
      fileName: blob.pathname,
      size: buffer.length
    });

  } catch (error) {
    console.error('Upload API: Error uploading image:', error);

    // If Vercel Blob fails, return a mock URL for development
    if (process.env.NODE_ENV === 'development') {
      console.log('Upload API: Vercel Blob failed, returning mock URL for development');
      try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { fileName, fileData } = body;
        return res.status(200).json({
          url: `https://mock-storage.dev/images/${fileName}`,
          fileName: fileName,
          size: fileData ? Buffer.from(fileData, 'base64').length : 0
        });
      } catch (parseError) {
        console.error('Upload API: Failed to parse request body for fallback:', parseError);
      }
    }

    return res.status(500).json({
      error: 'Failed to upload image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
