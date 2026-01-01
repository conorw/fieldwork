# GPS Accuracy Improvement Approaches

This document outlines various approaches to improve GPS accuracy when capturing photos in a straight line, addressing the issue of scattered GPS coordinates.

## Current Implementation

The app currently captures a single GPS reading when taking a photo, which can result in scattered coordinates due to:
- GPS signal noise and multipath errors
- Device movement during capture
- Environmental factors (buildings, trees, weather)
- Single reading variance

## Implemented Solutions

### 1. GPS Averaging (✅ Implemented)

**What it does:** Collects multiple GPS readings over a short period and averages them, filtering outliers.

**Benefits:**
- Reduces random GPS noise
- Filters out outlier readings
- Provides better accuracy estimate

**How it works:**
- Collects 5 GPS readings over ~4 seconds
- Filters outliers using IQR (Interquartile Range) method
- Calculates weighted average (more accurate readings weighted higher)
- Adds standard deviation to accuracy estimate

**Usage:** Automatically applied when taking photos via `PlotCreationWizard`.

**Configuration:** See `src/utils/gpsAveraging.ts`

### 2. GPS Stability Monitoring (✅ Implemented)

**What it does:** Monitors GPS readings to ensure stability before allowing photo capture.

**Benefits:**
- Prevents capture with unstable GPS
- Ensures consistent accuracy
- Provides user feedback on GPS status

**How it works:**
- Monitors GPS readings continuously
- Checks for consistent accuracy and position
- Disables photo capture until GPS is stable
- Shows visual indicator to user

**Usage:** Automatically applied in `PlotCreationWizard` when taking photos.

**Configuration:** See `src/utils/gpsStability.ts`

### 3. EXIF GPS Extraction (✅ Implemented)

**What it does:** Extracts GPS coordinates from photo EXIF metadata (camera GPS is often more accurate).

**Benefits:**
- Uses camera's GPS (often more accurate than app GPS)
- Provides backup if app GPS fails
- Can compare with app GPS for validation

**How it works:**
- Extracts GPS data from photo EXIF metadata using `exifr` library
- Estimates accuracy from GPS DOP (Dilution of Precision)
- Falls back to app GPS if EXIF GPS unavailable

**Usage:** Automatically applied when photos are captured.

**Configuration:** See `src/utils/exifGPS.ts`

### 4. Hybrid GPS Approach (✅ Implemented)

**What it does:** Combines EXIF GPS with app GPS for best accuracy.

**Benefits:**
- Uses best available GPS source
- Provides weighted average when both sources are similar
- Improves overall accuracy

**How it works:**
- Compares EXIF GPS accuracy with app GPS accuracy
- Uses EXIF GPS if it's more accurate
- Uses weighted average if accuracies are similar (within 20%)
- Falls back to app GPS if EXIF unavailable

**Usage:** Automatically applied when photos are captured.

**Configuration:** See `src/utils/exifGPS.ts` - `selectBestGPS()` function

### 5. GPS Heading Integration (✅ Implemented)

**What it does:** Uses GPS heading when available instead of relying solely on device orientation.

**Benefits:**
- GPS heading is more accurate than device orientation
- Better direction accuracy for plot positioning
- Reduces dependency on compass calibration

**How it works:**
- Checks if GPS reading includes heading information
- Uses GPS heading if available, falls back to device orientation
- Applied during GPS reading collection

**Usage:** Automatically applied when collecting GPS readings.

**Configuration:** See `PlotCreationWizard.vue` - GPS collection logic

### 6. Device Orientation Constraint (✅ Implemented)

**What it does:** Uses compass/device orientation to constrain GPS readings to movement line.

**Benefits:**
- Reduces GPS drift perpendicular to movement
- Maintains straight line alignment
- Filters readings that deviate too far from movement direction

**How it works:**
- Projects GPS readings onto movement line defined by device orientation
- Filters readings that deviate more than 5m perpendicular to movement
- Applied before GPS averaging

**Usage:** Automatically applied when collecting GPS readings with device orientation available.

**Configuration:** See `src/utils/gpsOrientationConstraint.ts`

## Additional Approaches to Consider

### 2. Kalman Filtering

**What it does:** Uses a mathematical filter to predict and correct GPS positions based on previous readings and movement.

**Benefits:**
- Smooths GPS trajectory
- Better handles movement prediction
- Reduces noise while maintaining responsiveness

**Implementation complexity:** Medium-High
**When to use:** When users are moving while taking photos

**Resources:**
- Libraries: `kalmanjs`, `kalman-filter`
- Can be combined with device motion sensors

### 3. Relative Positioning from Known Point

**What it does:** Uses a reference point (first photo or manually set point) and calculates relative positions using device orientation and estimated distance.

**Benefits:**
- Very accurate relative positioning
- Works well in straight lines
- Less dependent on absolute GPS accuracy

**Implementation:**
1. Capture first photo with GPS averaging
2. Use device orientation (compass) to determine direction
3. Estimate distance moved using:
   - Step counting (if available)
   - Time-based estimation
   - Visual markers
   - User input (e.g., "I moved 2 meters")

**When to use:** When capturing photos in a known pattern (straight line, grid, etc.)

### 4. Device Orientation Integration

**What it does:** Uses compass/gyroscope data to improve positioning when moving in a straight line.

**Benefits:**
- Helps maintain straight line alignment
- Can correct for GPS drift perpendicular to movement
- Provides heading information for relative positioning

**Current status:** Device orientation is tracked but not used for GPS correction

**Implementation:**
- Use heading from GPS or device compass
- Project GPS readings onto the movement line
- Filter readings that deviate too far from the line

### 5. Wait for Better Accuracy

**What it does:** Only captures GPS when accuracy meets a threshold.

**Benefits:**
- Simple to implement
- Prevents poor-quality readings
- Can be combined with averaging

**Current implementation:** `minAccuracy` threshold in GPS averaging (15m)

**Enhancement:** Show accuracy indicator to user, wait for improvement

### 6. EXIF Data from Photos

**What it does:** Extracts GPS coordinates from photo EXIF metadata (if camera adds it).

**Benefits:**
- Uses camera's GPS (often more accurate)
- Provides backup if app GPS fails
- Can compare with app GPS for validation

**Implementation:**
- Extract EXIF data using `exif-js` or `piexifjs`
- Use EXIF GPS if available and accurate
- Fallback to app GPS if EXIF missing

### 7. Visual Positioning / AR Features

**What it does:** Uses computer vision to determine relative positions from photo content.

**Benefits:**
- Very accurate relative positioning
- Works independently of GPS
- Can identify landmarks for positioning

**Implementation complexity:** High
**When to use:** When GPS is unreliable but visual features are consistent

**Resources:**
- AR.js for web AR
- TensorFlow.js for object detection
- Visual SLAM techniques

### 8. Dead Reckoning with Motion Sensors

**What it does:** Uses accelerometer and gyroscope to estimate movement from a known starting point.

**Benefits:**
- Works when GPS is unavailable
- Provides smooth movement tracking
- Can be combined with GPS

**Implementation complexity:** Medium-High
**Challenges:**
- Requires calibration
- Accumulates error over time
- Needs periodic GPS correction

### 9. Differential GPS / RTK (Real-Time Kinematic)

**What it does:** Uses correction signals from reference stations for centimeter-level accuracy.

**Benefits:**
- Extremely high accuracy (cm-level)
- Professional-grade positioning

**Limitations:**
- Requires RTK-capable hardware
- Needs correction signal source
- More expensive/complex

**When to use:** Professional surveying applications

### 10. Post-Processing Correction

**What it does:** Allows users to manually adjust GPS positions after capture.

**Benefits:**
- User can correct obvious errors
- Useful for validation
- Can use map context for correction

**Implementation:**
- Show accuracy circle on map
- Allow drag-and-drop correction
- Save correction offset for learning

## Recommended Implementation Priority

1. ✅ **GPS Averaging** - Implemented
2. ✅ **GPS Stability Monitoring** - Implemented
3. ✅ **EXIF GPS Extraction** - Implemented
4. ✅ **Hybrid GPS Approach** - Implemented
5. ✅ **GPS Heading Integration** - Implemented
6. ✅ **Device Orientation Constraint** - Implemented
7. **Wait for Better Accuracy** - Enhance current implementation with UI feedback
8. **Relative Positioning** - Add "straight line mode" for systematic capture
9. **Post-Processing Correction** - Allow manual adjustment

## Configuration Options

Add to settings:
- GPS averaging count (default: 5)
- GPS averaging interval (default: 800ms)
- Minimum accuracy threshold (default: 15m)
- Enable relative positioning mode
- Enable orientation-based filtering

## User Experience Improvements

1. **Accuracy Indicator:** Show GPS accuracy in real-time
2. **Averaging Progress:** Show progress while collecting GPS readings
3. **Straight Line Mode:** Toggle for systematic capture
4. **Visual Feedback:** Show accuracy circle on map
5. **Warning Messages:** Alert when accuracy is poor

## Testing Recommendations

1. Test in various environments:
   - Open field (best GPS)
   - Urban area (multipath issues)
   - Under trees (signal degradation)
   - Indoors (GPS unavailable)

2. Compare methods:
   - Single reading vs averaged
   - With/without outlier filtering
   - Different averaging counts

3. Measure improvements:
   - Standard deviation of readings
   - Distance from expected line
   - User satisfaction

