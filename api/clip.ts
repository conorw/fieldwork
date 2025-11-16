// api/clip.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

const execAsync = promisify(exec);

// Get go-pmtiles binary path (bundled or downloaded)
async function getPMTilesBinary(): Promise<string> {
  const platform = os.platform();
  const arch = os.arch();

  // For Vercel deployment, always use the bundled Linux binary
  if (process.env.VERCEL === '1') {
    const bundledPath = path.join(process.cwd(), 'bin', 'pmtiles');
    if (fs.existsSync(bundledPath)) {
      console.log('Using bundled go-pmtiles binary for Vercel');
      return bundledPath;
    }
    // If bundled binary doesn't exist on Vercel, fall back to download
    console.log('Bundled binary not found on Vercel, will download');
  }

  // For local development, download the correct binary for current platform
  const binaryPath = path.join(os.tmpdir(), `pmtiles-${platform}-${arch}`);

  // Check if binary already exists
  if (fs.existsSync(binaryPath)) {
    console.log(`Using cached go-pmtiles binary: ${binaryPath}`);
    return binaryPath;
  }

  // If we're on macOS ARM64 locally, try the bundled binary first, but fall back to download if it fails
  if (platform === 'darwin' && arch === 'arm64') {
    const bundledPath = path.join(process.cwd(), 'bin', 'pmtiles');
    if (fs.existsSync(bundledPath)) {
      // Try to execute the bundled binary to see if it works
      try {
        await execAsync(`"${bundledPath}" --help`);
        console.log('Using bundled go-pmtiles binary for local development');
        return bundledPath;
      } catch (error) {
        console.log('Bundled binary not compatible, will download correct ARM64 version');
        // Continue to download the correct binary
      }
    }
  }

  // Map Node.js platform/arch to go-pmtiles releases
  let binaryName: string;
  let isCompressed = false;

  if (platform === 'linux' && arch === 'x64') {
    binaryName = 'go-pmtiles_1.28.0_Linux_x86_64.tar.gz';
    isCompressed = true;
  } else if (platform === 'darwin' && arch === 'x64') {
    binaryName = 'go-pmtiles-1.28.0_Darwin_x86_64.zip';
    isCompressed = true;
  } else if (platform === 'darwin' && arch === 'arm64') {
    binaryName = 'go-pmtiles-1.28.0_Darwin_arm64.zip';
    isCompressed = true;
  } else if (platform === 'win32' && arch === 'x64') {
    binaryName = 'go-pmtiles_1.28.0_Windows_x86_64.zip';
    isCompressed = true;
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }

  console.log(`Downloading go-pmtiles binary: ${binaryName}`);

  // Download from GitHub releases
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v1.28.0/${binaryName}`;

  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `pmtiles-download-${Date.now()}`);
    const file = fs.createWriteStream(tempFile);

    const downloadFile = (downloadUrl: string) => {
      https.get(downloadUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log(`Following redirect to: ${redirectUrl}`);
            downloadFile(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download binary: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', async () => {
          file.close();

          try {
            if (isCompressed) {
              // Extract the binary from the archive
              const extractDir = path.join(os.tmpdir(), `pmtiles-extract-${Date.now()}`);
              fs.mkdirSync(extractDir, { recursive: true });

              let extractCommand: string;
              if (binaryName.endsWith('.tar.gz')) {
                extractCommand = `tar -xzf "${tempFile}" -C "${extractDir}"`;
              } else {
                extractCommand = `unzip -q "${tempFile}" -d "${extractDir}"`;
              }

              console.log(`Extracting archive: ${extractCommand}`);
              await execAsync(extractCommand);

              // Find the extracted binary
              const findCommand = `find "${extractDir}" -name "pmtiles" -o -name "pmtiles.exe" | head -1`;
              console.log(`Looking for binary: ${findCommand}`);
              const { stdout } = await execAsync(findCommand);
              const extractedPath = stdout.trim();

              console.log(`Found binary at: ${extractedPath}`);

              if (extractedPath && fs.existsSync(extractedPath)) {
                // Move to final location
                fs.renameSync(extractedPath, binaryPath);
                fs.chmodSync(binaryPath, 0o755);
                console.log(`Downloaded and extracted go-pmtiles binary to: ${binaryPath}`);

                // Clean up extraction directory
                try {
                  fs.rmSync(extractDir, { recursive: true, force: true });
                } catch (e) {
                  console.warn('Failed to clean up extraction directory:', e);
                }

                resolve(binaryPath);
              } else {
                // List contents for debugging
                const { stdout: lsOutput } = await execAsync(`find "${extractDir}" -type f`);
                console.log('Archive contents:', lsOutput);
                throw new Error('Failed to extract binary from archive - binary not found');
              }
            } else {
              // Direct binary download
              fs.renameSync(tempFile, binaryPath);
              fs.chmodSync(binaryPath, 0o755);
              console.log(`Downloaded go-pmtiles binary to: ${binaryPath}`);
              resolve(binaryPath);
            }
          } catch (err) {
            reject(err);
          } finally {
            // Clean up temp file
            try {
              fs.unlinkSync(tempFile);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        });
      }).on('error', (err) => {
        fs.unlink(tempFile, () => { }); // Delete partial file
        reject(err);
      });
    };

    downloadFile(url);
  });
}

export const maxDuration = 300; // let it work for a few minutes

type ClipBody = {
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  minZoom: number;
  maxZoom: number;
  name?: string;
};

// ---- Minimal PMTiles writer for small clips (single leaf dir, uncompressed) ----
type TileRef = { z: number; x: number; y: number; data: Uint8Array };
type DirEntry = { z: number; x: number; y: number; offset: number; length: number };

function writeUint64LE(view: DataView, offset: number, value: number) {
  // value expected < 2^53 here; enough for our tiny files
  const hi = Math.floor(value / 0x100000000);
  const lo = value >>> 0;
  view.setUint32(offset, lo, true);
  view.setUint32(offset + 4, hi, true);
}

function buildMinimalPMTiles(tiles: TileRef[]): Uint8Array {
  // PMTiles v3 header (127 bytes) + simple leaf directory + tile data concatenation
  // For tiny clips we keep one leaf directory page and one head page.
  // Layout:
  // [header (127)] [directory entries (fixed 32 bytes each)] [tile data blob]
  // This is intentionally minimal; good enough for tiny archives.
  const HEADER_SIZE = 127;
  const ENTRY_SIZE = 32; // z(2) x(4) y(4) offset(8) length(8) padding(6) -> we’ll keep it simple & aligned

  let dataOffset = HEADER_SIZE + tiles.length * ENTRY_SIZE;
  // round up to 8 for alignment
  if (dataOffset % 8 !== 0) dataOffset += 8 - (dataOffset % 8);

  // Compute directory entries with offsets
  let cursor = dataOffset;
  const entries: DirEntry[] = tiles.map((t) => {
    const e = { z: t.z, x: t.x, y: t.y, offset: cursor, length: t.data.byteLength };
    cursor += t.data.byteLength;
    return e;
  });

  // Allocate total buffer
  const totalSize = cursor;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // --- Header (v3) ---
  // PMTiles v3 header is 127 bytes
  // Magic bytes (8 bytes)
  const magic = new TextEncoder().encode('PMTiles\0');
  u8.set(magic, 0);

  // Version (1 byte)
  view.setUint8(8, 3);

  // Root directory offset (8 bytes, little-endian)
  writeUint64LE(view, 9, HEADER_SIZE);

  // Root directory length (8 bytes, little-endian)
  writeUint64LE(view, 17, tiles.length * ENTRY_SIZE);

  // JSON metadata offset (8 bytes, little-endian)
  writeUint64LE(view, 25, 0);

  // JSON metadata length (8 bytes, little-endian)
  writeUint64LE(view, 33, 0);

  // Leaf directories offset (8 bytes, little-endian)
  writeUint64LE(view, 41, 0);

  // Leaf directories length (8 bytes, little-endian)
  writeUint64LE(view, 49, 0);

  // Tile data offset (8 bytes, little-endian)
  writeUint64LE(view, 57, dataOffset);

  // Tile data length (8 bytes, little-endian)
  writeUint64LE(view, 65, totalSize - dataOffset);

  // Addressed tiles count (8 bytes, little-endian)
  writeUint64LE(view, 73, 0);

  // Tile entries count (8 bytes, little-endian)
  writeUint64LE(view, 81, tiles.length);

  // Tile contents count (8 bytes, little-endian)
  writeUint64LE(view, 89, tiles.length);

  // Clustered (1 byte)
  view.setUint8(97, 0);

  // Internal compression (1 byte)
  view.setUint8(98, 0);

  // Tile compression (1 byte)
  view.setUint8(99, 0);

  // Tile type (1 byte)
  view.setUint8(100, 0);

  // Min zoom (1 byte)
  view.setUint8(101, Math.min(...tiles.map(t => t.z)));

  // Max zoom (1 byte)
  view.setUint8(102, Math.max(...tiles.map(t => t.z)));

  // Min lon (4 bytes, little-endian)
  view.setFloat32(103, -180, true);

  // Min lat (4 bytes, little-endian)
  view.setFloat32(107, -90, true);

  // Max lon (4 bytes, little-endian)
  view.setFloat32(111, 180, true);

  // Max lat (4 bytes, little-endian)
  view.setFloat32(115, 90, true);

  // Center zoom (1 byte)
  view.setUint8(119, 0);

  // Center lon (4 bytes, little-endian)
  view.setFloat32(120, 0, true);

  // Center lat (4 bytes, little-endian)
  view.setFloat32(124, 0, true);

  // --- Directory entries ---
  let dirPtr = HEADER_SIZE;
  for (const e of entries) {
    view.setUint16(dirPtr, e.z, true);
    view.setUint32(dirPtr + 2, e.x, true);
    view.setUint32(dirPtr + 6, e.y, true);
    writeUint64LE(view, dirPtr + 10, e.offset);
    writeUint64LE(view, dirPtr + 18, e.length);
    // padding (6 bytes) left as zero
    dirPtr += ENTRY_SIZE;
  }

  // --- Tile data ---
  let dataPtr = dataOffset;
  for (const t of tiles) {
    u8.set(t.data, dataPtr);
    dataPtr += t.data.byteLength;
  }

  return u8;
}

// Generate PMTiles using go-pmtiles CLI extract command
async function generatePMTilesWithCLI(sourcePMTilesUrl: string, bbox: [number, number, number, number], minZoom: number, maxZoom: number): Promise<Uint8Array> {
  const binaryPath = await getPMTilesBinary();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtiles-'));

  try {
    // Use go-pmtiles extract command to extract a portion of the source PMTiles
    const outputPath = path.join(tempDir, 'output.pmtiles');
    const [minLon, minLat, maxLon, maxLat] = bbox;

    // go-pmtiles extract command: extract <source> <output> --bbox=minLon,minLat,maxLon,maxLat --minzoom=z --maxzoom=z
    const command = `"${binaryPath}" extract "${sourcePMTilesUrl}" "${outputPath}" --bbox=${minLon},${minLat},${maxLon},${maxLat}`;

    console.log(`Running go-pmtiles extract command: ${command}`);
    
    // Test if binary is executable first by trying to run it with help
    try {
      await execAsync(`"${binaryPath}" --help`);
    } catch (helpError) {
      console.error('Binary execution test failed:', helpError);
      throw new Error(`PMTiles binary is not executable or incompatible with this platform. Please ensure the correct binary is available for ${os.platform()}-${os.arch()}.`);
    }
    
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      console.log('go-pmtiles stderr:', stderr);
    }
    if (stdout) {
      console.log('go-pmtiles stdout:', stdout);
    }

    // Read the generated PMTiles file
    const pmtilesData = fs.readFileSync(outputPath);
    console.log(`Generated PMTiles file size: ${pmtilesData.length} bytes`);

    return new Uint8Array(pmtilesData);

  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('Failed to clean up temp directory:', err);
    }
  }
}

// ---- Helper: list z/x/y tiles intersecting bbox at each zoom ----
function tilesForBBox(bbox: [number, number, number, number], minZ: number, maxZ: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const tiles: Array<{ z: number; x: number; y: number }> = [];

  console.log(`Calculating tiles for bbox: [${minLon}, ${minLat}, ${maxLon}, ${maxLat}]`);
  console.log(`Bbox format: [minLon, minLat, maxLon, maxLat]`);

  for (let z = minZ; z <= maxZ; z++) {
    // Convert lat/lon to tile coordinates manually
    const minTile = pointToTile(minLon, maxLat, z);
    const maxTile = pointToTile(maxLon, minLat, z);
    const [minX, minY] = [Math.min(minTile[0], maxTile[0]), Math.min(minTile[1], maxTile[1])];
    const [maxX, maxY] = [Math.max(minTile[0], maxTile[0]), Math.max(minTile[1], maxTile[1])];

    console.log(`Zoom ${z}: tile range x:${minX}-${maxX}, y:${minY}-${maxY}`);
    console.log(`  SW corner (${minLon}, ${maxLat}) -> tile (${minTile[0]}, ${minTile[1]})`);
    console.log(`  NE corner (${maxLon}, ${minLat}) -> tile (${maxTile[0]}, ${maxTile[1]})`);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

// Simple lat/lon to tile conversion
function pointToTile(lon: number, lat: number, zoom: number): [number, number] {
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lon + 180) / 360 * n);
  // Use proper math for y calculation (this is the standard Web Mercator formula)
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);

  // Validate tile coordinates are within bounds
  if (xtile < 0 || xtile >= n || ytile < 0 || ytile >= n) {
    console.warn(`Invalid tile coordinates: z=${zoom}, x=${xtile}, y=${ytile} (bounds: 0-${n - 1})`);
    // Clamp to valid bounds
    const clampedX = Math.max(0, Math.min(xtile, n - 1));
    const clampedY = Math.max(0, Math.min(ytile, n - 1));
    console.warn(`Clamped to: z=${zoom}, x=${clampedX}, y=${clampedY}`);
    return [clampedX, clampedY];
  }

  console.log(`pointToTile: lon=${lon}, lat=${lat}, zoom=${zoom} -> x=${xtile}, y=${ytile}`);
  return [xtile, ytile];
}

async function savePMTilesToBlobStorage(data: Uint8Array, filename: string): Promise<string> {
  try {
    // Check if BLOB_READ_WRITE_TOKEN is available
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN environment variable is not set. Please add it to your Vercel project environment variables.');
    }

    console.log('Uploading PMTiles to Vercel Blob Storage...');
    console.log('Filename:', filename);
    console.log('Data size:', data.byteLength, 'bytes');

    // Convert Uint8Array to Buffer for Vercel Blob
    const buffer = Buffer.from(data);

    // Upload to Vercel Blob Storage
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'application/octet-stream'
    });

    console.log(`✅ PMTiles uploaded to Vercel Blob: ${blob.url}`);
    return blob.url;
  } catch (error) {
    console.error('❌ Error uploading PMTiles to Vercel Blob Storage:', error);

    // Provide specific error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('Access denied')) {
        throw new Error('Vercel Blob access denied. Please check your BLOB_READ_WRITE_TOKEN is valid and has the correct permissions.');
      } else if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
        throw new Error('BLOB_READ_WRITE_TOKEN environment variable is not set. Please add it to your Vercel project environment variables.');
      }
    }

    throw new Error(`Failed to upload PMTiles to blob storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  console.log('req body:', req.body);
  const { bbox, minZoom, maxZoom, name }: ClipBody = req.body;
  console.log('bbox', bbox);

  if (!bbox || bbox.length !== 4) return res.status(400).send('bbox required');
  if (typeof minZoom !== 'number' || typeof maxZoom !== 'number') return res.status(400).send('minZoom/maxZoom required');

  const srcURL = process.env.SOURCE_PMTILES_URL;
  if (!srcURL) return res.status(500).send('SOURCE_PMTILES_URL not configured');

  // Guardrails for serverless
  if (maxZoom > 19) return res.status(400).send('maxZoom too high for serverless clip (<=19)');
  if (minZoom < 0 || minZoom > maxZoom) return res.status(400).send('invalid zooms');

  try {

    // Use go-pmtiles CLI to extract a portion of the source PMTiles file
    console.log('Using go-pmtiles CLI to extract PMTiles...');
    const out = await generatePMTilesWithCLI(srcURL, bbox, minZoom, maxZoom);
    console.log(`PMTiles archive extracted successfully, size: ${out.byteLength} bytes`);

    // Generate filename for the PMTiles file
    const filename = `pmtiles/clip-${name}.pmtiles`;

    try {
      // Try to save to blob storage and return the url
      const url = await savePMTilesToBlobStorage(out, filename);
      return res.status(200).send(url);
    } catch (blobError) {
      console.warn('⚠️ Failed to upload to blob storage, returning data directly:', blobError);

      // Fallback: return the data directly as base64
      const base64 = Buffer.from(out).toString('base64');
      return res.status(200).json({
        data: base64,
        size: out.byteLength,
        error: 'Blob storage unavailable, data returned as base64',
        message: 'PMTiles generated successfully but could not be uploaded to cloud storage. Data is returned as base64 for local use.'
      });
    }
  } catch (buildError) {
    console.error('Error building PMTiles archive:', buildError);
    const errorMessage = buildError instanceof Error ? buildError.message : 'Unknown error';
    return res.status(500).send(`Error building PMTiles: ${errorMessage}`);
  }

}

