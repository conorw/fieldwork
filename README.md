# Fieldwork

A local-first progressive web application for cemetery plot documentation and field data collection. Built with Vue 3, TypeScript, and offline-first architecture.

## ✨ Features

### 🗺️ Interactive Mapping
- **Plot Management**: Create, edit, and view cemetery plots on an interactive map
- **GPS Integration**: Real-time location tracking with compass heading
- **Offline Maps**: PMTiles cached in IndexedDB for offline use
- **Interactive Editing**: Drag, rotate, and resize plot polygons with touch-optimized controls
- **Customizable Boundaries**: Set extent constraints and zoom limits per location

### 📸 Smart Image Processing
- **Automatic Compression**: Client-side image compression for faster uploads
- **Thumbnail Generation**: Automatic thumbnail creation for efficient storage
- **Cloud Storage**: Integration with Vercel Blob Storage for image hosting
- **Image Analysis**: AI-powered headstone text extraction and person data extraction

### 🤖 AI-Powered Headstone Analysis
- **Dual Analysis Modes**:
  - **OpenAI API** (default): Fast, cloud-based analysis using GPT-4o-mini
  - **Local Browser Model**: Privacy-focused, offline-capable analysis using Transformers.js
- **Automatic Text Extraction**: Extracts names, dates, relationships, and full transcriptions
- **Structured Data**: Automatically populates person records with extracted information
- **Optimized Performance**: Client-side compression and optimized prompts for 8-10 second analysis times

### 📱 Progressive Web App
- **Installable**: Works as a native app on iOS and Android
- **Offline-First**: Full functionality without internet connection
- **Real-time Sync**: PowerSync integration for seamless data synchronization
- **Mobile-Optimized**: Touch gestures, responsive design, and native device features

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fieldwork
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```bash
   # PowerSync Configuration (Required)
   VITE_POWERSYNC_URL=your_powersync_url
   VITE_POWERSYNC_DEV_TOKEN=your_dev_token
   
   # Supabase Configuration (Required)
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # OpenAI API Key (Required for OpenAI analysis mode)
   OPENAI_API_KEY=your_openai_api_key
   
   # Vercel Blob Storage (Optional, for image hosting)
   BLOB_READ_WRITE_TOKEN=your_blob_token
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5173`

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview

# Type checking
npm run type-check
```

## 🎯 Usage Guide

### Creating a Plot

1. Navigate to the Map view
2. Click the "Create Plot" button
3. Draw a polygon on the map to define the plot boundaries
4. Fill in plot details (name, type, etc.)
5. Optionally add images and analyze headstones

### Analyzing Headstones

1. **Add an Image**: Upload a photo of a headstone when creating or editing a plot
2. **Select Analysis Mode**: 
   - Go to Settings → AI Analysis Settings
   - Choose between "OpenAI API" or "Local Browser Model"
3. **Automatic Analysis**: The app will automatically extract:
   - Person names (forename, surname, full name)
   - Dates (birth, death, age)
   - Relationships and epitaphs
   - Complete text transcription
4. **Review Results**: The extracted data will populate the person form automatically

📖 **Detailed Guide**: See [AI Analysis Documentation](./docs/AI.md) for comprehensive information about analysis modes, performance, and troubleshooting.

### Switching Analysis Modes

**OpenAI API Mode** (Default):
- Fast analysis (8-10 seconds)
- Requires internet connection
- Uses GPT-4o-mini for cost-effective processing
- Best for production use

**Local Browser Model**:
- Privacy-focused (no data sent to external servers)
- Works offline after initial model download
- Uses Transformers.js with OCR and text generation models
- Models download automatically on first use (~100-200MB)

📖 **Learn More**: See [AI Analysis Documentation](./docs/AI.md) for detailed information about both modes.

### Offline Usage

- **Maps**: PMTiles are cached automatically when you view areas ([Learn more](./docs/OFFLINE_MAPPING.md))
- **Data**: All plot and person data is stored locally in IndexedDB ([Learn more](./docs/OFFLINE_DATA.md))
- **Sync**: Changes sync automatically when connection is restored
- **Images**: Previously viewed images are cached for offline access ([Learn more](./docs/PHOTO_HANDLING.md))

## 📚 Project Structure

```
fieldwork/
├── src/
│   ├── components/          # Vue components (maps, forms, wizards)
│   ├── views/               # Page views (Map, Settings, etc.)
│   ├── stores/              # Pinia state management
│   │   ├── settings.ts      # App settings (analysis mode, map config)
│   │   ├── powersync.ts     # PowerSync database operations
│   │   ├── persons.ts       # Person data management
│   │   └── locations.ts     # Location/facility management
│   ├── services/            # External services
│   │   ├── localLLMService.ts    # Local browser-based AI analysis
│   │   └── imageProcessingService.ts  # Image compression & thumbnails
│   ├── utils/               # Utilities
│   │   ├── headstoneAnalysisService.ts  # Headstone analysis orchestration
│   │   └── ...              # Map utilities, caching, etc.
│   ├── connectors/          # Backend connectors
│   │   └── SupabaseConnector.ts  # Supabase authentication & sync
│   └── router/              # Vue Router configuration
├── api/                     # Vercel serverless functions
│   ├── analyze-headstone.ts # OpenAI Vision API integration
│   ├── upload-image.ts      # Image upload to blob storage
│   └── clip.ts              # Map tile clipping utilities
├── packages/                # Shared packages
│   └── database/            # Database migrations
└── public/                   # Static assets
```

## 🔧 Tech Stack

### Frontend
- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **PrimeVue** - UI component library
- **Tailwind CSS** - Utility-first CSS framework
- **Pinia** - State management
- **Vue Router** - Client-side routing

### Mapping
- **OpenLayers** (v10.6.1) - Open-source mapping library
- **ol-ext** (v4.0.35) - Extended OpenLayers features
- **PMTiles** (v4.3.0) - Efficient tile storage format
- **ol-pmtiles** (v2.0.2) - PMTiles integration for OpenLayers

### Storage & Sync
- **PowerSync** - Real-time data synchronization
- **Supabase** - Backend database and authentication
- **IndexedDB** - Local browser storage
- **wa-sqlite** - WebAssembly SQLite for local queries

### AI & Image Processing
- **OpenAI API** - GPT-4o-mini for headstone analysis
- **Transformers.js** - Local browser-based AI models
- **Sharp** - Server-side image processing (Vercel functions)

### Mobile & PWA
- **Capacitor** - Native device features (camera, GPS, motion)
- **Workbox** - Service worker and offline caching
- **PWA** - Progressive Web App capabilities

### Deployment
- **Vercel** - Hosting and serverless functions
- **Vercel Blob Storage** - Image hosting

## 🗺️ Map Configuration

### Coordinate Systems
- **EPSG:3857** (Web Mercator): Used for map display
- **EPSG:4326** (WGS84): Used for GPS coordinates
- Automatic conversion between systems

### Map Features
- **Vector Layers**: Plot polygons and points
- **Tile Layers**: PMTiles for base maps
- **Interactions**: Click, drag, modify, transform
- **Controls**: Zoom, scale, attribution, location tracking

## 📖 Documentation

### Core Features

- **[Offline Mapping](./docs/OFFLINE_MAPPING.md)** - How PMTiles caching works, offline map functionality, and cache management
- **[Photo Handling](./docs/PHOTO_HANDLING.md)** - Image processing, compression, thumbnails, and cloud storage
- **[Offline Data](./docs/OFFLINE_DATA.md)** - PowerSync synchronization, local storage, and data management
- **[AI Analysis](./docs/AI.md)** - Headstone analysis features, OpenAI vs Local models, and usage guide

### Additional Guides

- [Database Migrations](./packages/database/README.md) - Database schema and migrations

## 🛠️ Development

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check

# Watch mode type checking
npm run type-check:watch

# Lint code
npm run lint
```

### Code Style
- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting

## 🐛 Troubleshooting

### Analysis Not Working
- **OpenAI Mode**: Check that `OPENAI_API_KEY` is set in your environment variables
- **Local Mode**: Ensure models have finished downloading (check Settings page)
- **Network Issues**: Local mode requires internet for initial model download

### Maps Not Loading
- Check that PMTiles files are properly configured
- Verify internet connection for initial tile download
- Check browser console for IndexedDB errors

### Sync Issues
- Verify PowerSync and Supabase credentials are correct
- Check browser console for authentication errors
- Ensure Supabase project is properly configured

### Build Errors
- Ensure Node.js version is >= 18.0.0
- Delete `node_modules` and `package-lock.json`, then run `npm install`
- Check TypeScript errors with `npm run type-check`

## 📝 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

### What does GPL mean?

The GPL (GNU General Public License) is a "copyleft" license that ensures software remains free and open. Here's what it means in simple terms:

**✅ You can:**
- Use this software for any purpose (personal, commercial, etc.)
- Study how it works by examining the source code
- Modify the code to suit your needs
- Share the original software with others
- Distribute your modified versions

**📋 You must:**
- Keep the same GPL license when you share or distribute the software
- Make your source code available if you distribute modified versions
- Include the original license and copyright notices
- Document any significant changes you make

**💡 In essence:** GPL ensures that this software and any improvements to it remain free and open for everyone. If you build upon this project, your contributions must also be open source under the same license.

---

**Built with ❤️ for efficient cemetery documentation**
