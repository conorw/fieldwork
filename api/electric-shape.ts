// API endpoint for proxying Electric Cloud shape requests
// This solves CORS issues and keeps the source secret secure
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests (Electric Cloud shapes use GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Get Electric Cloud configuration from environment
    const sourceId = process.env.VITE_ELECTRIC_SOURCE_ID || process.env.ELECTRIC_SOURCE_ID;
    const sourceSecret = process.env.ELECTRIC_SOURCE_SECRET;
    const electricCloudUrl = 'https://api.electric-sql.cloud/v1/shape';

    if (!sourceId) {
      console.error('Electric Cloud source ID not configured');
      return res.status(500).json({ error: 'Electric Cloud not configured' });
    }

    if (!sourceSecret) {
      console.warn('Electric Cloud source secret not configured - requests may fail');
    }

    // Validate and authorize the request
    // In production, you should validate the user's Supabase session here
    // For now, we'll allow all requests (you can add auth later)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.warn('No authorization header provided');
      // Uncomment to require auth:
      // return res.status(401).json({ error: 'Unauthorized' });
    }

    // Construct the origin URL to Electric Cloud
    const originUrl = new URL(electricCloudUrl);
    
    // Copy all query parameters from the client request
    const clientUrl = new URL(req.url || '', `http://${req.headers.host}`);
    clientUrl.searchParams.forEach((value, key) => {
      // Don't copy source_id or secret if client accidentally sends them
      if (key !== 'source_id' && key !== 'secret') {
        // Special handling for WHERE clause - fix space encoding issues
        // URL encoding converts spaces to +, but Electric Cloud needs proper spaces
        if (key === 'where') {
          // Decode + signs back to spaces, then let URL encoding handle it properly
          const decoded = value.replace(/\+/g, ' ');
          originUrl.searchParams.set(key, decoded);
        } else {
          originUrl.searchParams.set(key, value);
        }
      }
    });

    // Add the source credentials (server-side only)
    originUrl.searchParams.set('source_id', sourceId);
    if (sourceSecret) {
      originUrl.searchParams.set('secret', sourceSecret);
    }

    console.log('Proxying Electric Cloud request:', originUrl.toString().replace(/secret=[^&]+/, 'secret=***'));
    console.log('Decoded WHERE clause:', decodeURIComponent(originUrl.searchParams.get('where') || ''));
    // Log all params entries to see how they're structured
    const allParams = Object.fromEntries(originUrl.searchParams.entries());
    console.log('All params:', JSON.stringify(allParams, null, 2));
    // Check for params[1], params[2], etc.
    const paramEntries = Object.keys(allParams).filter(k => k.startsWith('params'));
    console.log('Param entries:', paramEntries.map(k => `${k}=${allParams[k]}`));

    // Proxy the request to Electric Cloud
    const response = await fetch(originUrl.toString(), {
      method: 'GET',
      headers: {
        // Forward authorization header if present (for Electric Cloud auth)
        ...(authHeader && { Authorization: authHeader }),
        // Forward other relevant headers
        'Accept': req.headers.accept || 'application/json',
        'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate, br',
      },
    });

    // Check if the response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Electric Cloud error:', response.status, errorText);
      console.error('Request URL:', originUrl.toString().replace(/secret=[^&]+/, 'secret=***'));
      console.error('Response headers:', Object.fromEntries(response.headers.entries()));
      return res.status(response.status).json({ 
        error: 'Electric Cloud request failed',
        details: errorText 
      });
    }
    
    console.log('✅ Electric Cloud response OK, status:', response.status);

    // Fetch decompresses the body but doesn't remove the
    // content-encoding & content-length headers which would
    // break decoding in the browser.
    // See https://github.com/whatwg/fetch/issues/1729
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');

    // Forward the response with proper headers
    res.status(response.status);
    headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Stream the response body directly
    // Electric Cloud returns streaming data, so we need to pipe it through
    if (response.body) {
      // Convert ReadableStream to Node.js stream
      const reader = response.body.getReader();
      
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              break;
            }
            // Write the chunk directly (it's already a Uint8Array)
            res.write(Buffer.from(value));
          }
        } catch (error) {
          console.error('Error streaming response:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming error' });
          } else {
            res.end();
          }
        }
      };
      
      pump();
    } else {
      res.end();
    }

  } catch (error) {
    console.error('Error proxying Electric Cloud request:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

