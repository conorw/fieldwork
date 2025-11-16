# Offline Data

Fieldwork uses PowerSync with IndexedDB to provide full offline functionality. All data is stored locally and automatically syncs when online, ensuring you can work anywhere, anytime.

## Overview

The offline data system:
- **Local-First**: All data stored locally in IndexedDB
- **Real-Time Sync**: Automatic synchronization when online
- **Conflict Resolution**: Handles conflicts automatically
- **Offline-First**: Works completely offline
- **PowerSync**: Uses PowerSync for efficient sync

## Architecture

### PowerSync Database

PowerSync uses WebAssembly SQLite (wa-sqlite) on top of IndexedDB:

```
Application
    ↓
PowerSync Layer (wa-sqlite)
    ↓
IndexedDB (Browser Storage)
    ↓
Local Disk
```

### Data Flow

1. **Local Writes**: Data written to local PowerSync database
2. **Immediate Availability**: Data available immediately (no network wait)
3. **Background Sync**: PowerSync syncs changes when online
4. **Conflict Resolution**: Conflicts resolved automatically
5. **Bi-Directional**: Changes sync both ways (local ↔ server)

## Database Schema

### Core Tables

**Plots**
- Plot information (name, type, location, etc.)
- Geometry data (polygons, coordinates)
- Metadata (created date, creator, etc.)

**Persons**
- Person information (name, dates, relationships)
- Personal details (gender, age, etc.)
- Location information (birth, death locations)

**Plot Images**
- Image metadata
- Thumbnail data (base64)
- Cloud URLs for full images

**Person Images**
- Person photo metadata
- Thumbnail data
- Cloud URLs

**Locations**
- Facility/location information
- Map configuration
- PMTiles URLs

## PowerSync Configuration

### Database Setup

```typescript
const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'fieldwork-powersync.db',
    debugMode: true
  },
  flags: {
    enableMultiTabs: false,
    broadcastLogs: true
  }
})
```

### Sync Configuration

- **Backend**: Supabase
- **Connector**: `SupabaseConnector`
- **Authentication**: Anonymous login
- **Sync Strategy**: Real-time bidirectional sync

## Offline Functionality

### What Works Offline

✅ **Create Plots**: Create new plots and draw boundaries
✅ **Edit Plots**: Modify existing plot data
✅ **Add Persons**: Create person records
✅ **Add Images**: Upload photos (queued for sync)
✅ **View Data**: View all locally stored data
✅ **Search**: Search through local data
✅ **Map Navigation**: View cached maps

### What Requires Online

❌ **Initial Sync**: First-time data download
❌ **Image Upload**: Full image upload to cloud
❌ **AI Analysis**: Headstone analysis (unless using local model)
❌ **Map Downloads**: Downloading new map areas

## Sync Process

### Initial Sync

1. **Connect**: PowerSync connects to Supabase
2. **Authenticate**: Anonymous authentication
3. **Download**: Downloads all data for user
4. **Store**: Stores in local IndexedDB
5. **Ready**: App is ready for offline use

### Ongoing Sync

1. **Local Changes**: User makes changes locally
2. **Queue**: Changes queued for upload
3. **Upload**: Uploaded when online
4. **Download**: Download remote changes
5. **Merge**: Merge changes automatically

### Conflict Resolution

- **Last Write Wins**: Most recent change wins
- **Automatic**: Conflicts resolved automatically
- **No Data Loss**: All changes preserved
- **Timestamp Based**: Uses timestamps for ordering

## Data Storage

### IndexedDB

- **Database Name**: `fieldwork-powersync.db`
- **Storage**: Browser IndexedDB
- **Size Limit**: Typically 50% of available disk space
- **Persistence**: Data persists across sessions

### Storage Structure

```
IndexedDB
└── fieldwork-powersync.db
    ├── plots
    ├── persons
    ├── plot_images
    ├── person_images
    ├── locations
    └── sync_metadata
```

## Querying Data

### PowerSync Queries

```typescript
// Get all plots
const plots = await powerSync.getAll('SELECT * FROM plots')

// Get plots for location
const plots = await powerSync.getAll(
  'SELECT * FROM plots WHERE location_id = ?',
  [locationId]
)

// Get person with images
const person = await powerSync.get(
  'SELECT * FROM persons WHERE id = ?',
  [personId]
)
```

### Reactive Queries

```typescript
// Reactive query that updates automatically
const plots = useReactivePowerSyncQuery(
  computed(() => 'SELECT * FROM plots WHERE location_id = ?'),
  computed(() => [locationId])
)
```

## Sync Status

### Monitoring Sync

The app tracks sync status:
- **Status**: `not_started`, `connecting`, `connected`, `error`
- **Last Sync**: Timestamp of last successful sync
- **Pending Uploads**: Number of queued changes
- **Connection State**: Online/offline status

### Sync Indicators

- **Green**: Synced and up to date
- **Yellow**: Syncing in progress
- **Red**: Sync error or offline
- **Pending Count**: Number of unsynced changes

## Performance

### Query Performance

- **Local Queries**: Fast (< 100ms typically)
- **Indexed Queries**: Very fast with proper indexes
- **Complex Queries**: May be slower, optimize as needed
- **First Query**: Slightly slower (WASM initialization)

### Sync Performance

- **Upload Speed**: Depends on network and data size
- **Download Speed**: Depends on network and server
- **Batch Operations**: More efficient than individual
- **Background Sync**: Doesn't block UI

## Best Practices

### For Users

1. **Let It Sync**: Allow sync to complete before closing app
2. **Check Status**: Monitor sync status in Settings
3. **Wait for Upload**: Wait for image uploads to complete
4. **Stable Connection**: Use stable connection for initial sync

### For Developers

1. **Index Queries**: Add indexes for frequently queried fields
2. **Batch Operations**: Batch multiple operations together
3. **Error Handling**: Handle sync errors gracefully
4. **Progress Indicators**: Show sync progress to users

## Troubleshooting

### Data Not Syncing

1. **Check Connection**: Ensure internet connection is active
2. **Check Status**: Verify sync status in Settings
3. **Check Errors**: Look for error messages in console
4. **Restart Sync**: Try disconnecting and reconnecting

### Slow Queries

1. **Check Indexes**: Ensure proper indexes exist
2. **Optimize Queries**: Simplify complex queries
3. **Check Data Size**: Large datasets may be slower
4. **Check Browser**: Some browsers are slower than others

### Data Conflicts

1. **Automatic Resolution**: Conflicts resolved automatically
2. **Last Write Wins**: Most recent change is kept
3. **Check Timestamps**: Verify timestamps are correct
4. **Manual Review**: Review conflicts if needed

### Storage Issues

1. **Check Quota**: Ensure browser storage quota not exceeded
2. **Clear Old Data**: Remove old/unused data
3. **Check Browser**: Some browsers have lower limits
4. **Private Browsing**: IndexedDB may be disabled

## Migration

### Schema Migrations

PowerSync handles schema migrations automatically:
- **Version Tracking**: Tracks schema versions
- **Automatic Updates**: Updates schema when needed
- **Data Preservation**: Preserves existing data
- **Rollback**: Can rollback if needed

### Data Migration

For data structure changes:
1. **Create Migration**: Add migration SQL file
2. **Test Locally**: Test migration on local data
3. **Deploy**: Deploy migration with app update
4. **Monitor**: Monitor for migration issues

## Related Documentation

- [Offline Mapping](./OFFLINE_MAPPING.md) - Map caching and offline maps
- [Photo Handling](./PHOTO_HANDLING.md) - Image storage and processing
- [AI Analysis](./AI.md) - AI features and analysis
- [Main README](../README.md) - General application documentation

