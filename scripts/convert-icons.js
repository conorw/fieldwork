import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertSvgToPng() {
  const iconsDir = path.join(__dirname, 'public', 'icons');
  
  // Convert 192x192 SVG to PNG
  try {
    const svg192 = fs.readFileSync(path.join(iconsDir, 'icon-192x192.svg'));
    await sharp(svg192)
      .resize(192, 192)
      .png()
      .toFile(path.join(iconsDir, 'icon-192x192.png'));
    console.log('✅ Created icon-192x192.png');
  } catch (error) {
    console.error('❌ Error creating icon-192x192.png:', error.message);
  }

  // Convert 512x512 SVG to PNG
  try {
    const svg512 = fs.readFileSync(path.join(iconsDir, 'icon-512x512.svg'));
    await sharp(svg512)
      .resize(512, 512)
      .png()
      .toFile(path.join(iconsDir, 'icon-512x512.png'));
    console.log('✅ Created icon-512x512.png');
  } catch (error) {
    console.error('❌ Error creating icon-512x512.png:', error.message);
  }

  // Create additional sizes
  const sizes = [72, 96, 128, 144, 152, 384];
  
  for (const size of sizes) {
    try {
      const svg = fs.readFileSync(path.join(iconsDir, 'icon-192x192.svg'));
      await sharp(svg)
        .resize(size, size)
        .png()
        .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));
      console.log(`✅ Created icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`❌ Error creating icon-${size}x${size}.png:`, error.message);
    }
  }
}

convertSvgToPng().catch(console.error);