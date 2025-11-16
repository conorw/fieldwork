import { expect, test } from 'vitest';

const API = process.env.API_URL ?? 'http://localhost:3000/api/clip';


test('clips 1km×1km successfully', async () => {
    // ballycastle bbox
    const bbox = [-6, 55, -6, 55];
  const body = {
    bbox,
    minZoom: 16,
    maxZoom: 20,
    name: 'vitest-clip'
  };

//   // Add timeout to fetch calls to fail fast if API is unavailable
//   const controller = new AbortController();
//   const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

    //clearTimeout(timeoutId);
    console.log('r', r);
    
    if (!r.ok) {
      throw new Error(`API request failed: ${r.status} ${r.statusText}`);
    }
    
    const json = await r.json();
    expect(r.ok).toBe(true);
    expect(typeof json.url).toBe('string');

    const rr = await fetch(json.url);
    expect(rr.ok).toBe(true);
    const ab = await rr.arrayBuffer();
    const magic = new TextDecoder().decode(new Uint8Array(ab, 0, 8));
    expect(magic).toBe('PMTiles\u0000');
  } catch (error) {
    //clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Test timed out after 5 seconds. Make sure the API server is running with 'vercel dev'`);
    }
    throw error;
  }
}, 10_000); // Reduced timeout to 10 seconds
