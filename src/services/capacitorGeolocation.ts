import { Geolocation } from "@capacitor/geolocation";

export interface CapacitorLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
}

export class CapacitorGeolocationService {
  private static instance: CapacitorGeolocationService;
  private watchId: string | null = null;
  private firstFixTime: number | null = null; // Track time to first fix for adaptive timeouts
  private averageFixTime: number | null = null; // Track average fix time
  private fixCount: number = 0; // Count of successful fixes

  static getInstance(): CapacitorGeolocationService {
    if (!CapacitorGeolocationService.instance) {
      CapacitorGeolocationService.instance = new CapacitorGeolocationService();
    }
    return CapacitorGeolocationService.instance;
  }

  /**
   * Get adaptive timeout based on device performance
   */
  private getAdaptiveTimeout(): number {
    // If we have average fix time, use it to determine timeout
    if (this.averageFixTime !== null) {
      // Use 3x the average fix time, but cap between 10s and 30s
      const adaptiveTimeout = Math.max(
        10000,
        Math.min(30000, this.averageFixTime * 3),
      );
      return adaptiveTimeout;
    }

    // Default timeout for first fix
    return 30000; // 30 seconds
  }

  /**
   * Record fix time for adaptive timeout calculation
   */
  private recordFixTime(fixTime: number): void {
    this.fixCount++;

    if (this.firstFixTime === null) {
      this.firstFixTime = fixTime;
      this.averageFixTime = fixTime;
    } else {
      // Update running average
      this.averageFixTime =
        (this.averageFixTime! * (this.fixCount - 1) + fixTime) / this.fixCount;
    }
  }

  /**
   * Get current position with high accuracy and adaptive timeout
   */
  async getCurrentPosition(): Promise<CapacitorLocation> {
    const startTime = Date.now();
    const timeout = this.getAdaptiveTimeout();

    try {
      console.log(
        "CapacitorGeolocation: Requesting high accuracy position...",
        {
          timeout: `${timeout}ms`,
          averageFixTime: this.averageFixTime
            ? `${this.averageFixTime}ms`
            : "N/A",
        },
      );

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeout,
        maximumAge: 0, // Don't use cached position
      });

      const fixTime = Date.now() - startTime;
      this.recordFixTime(fixTime);

      const location: CapacitorLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
        timestamp: position.timestamp,
        altitude: position.coords.altitude || undefined,
        altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
        heading: position.coords.heading || undefined,
        speed: position.coords.speed || undefined,
      };

      console.log("CapacitorGeolocation: High accuracy position obtained:", {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        altitude: location.altitude,
        fixTime: `${fixTime}ms`,
      });

      return location;
    } catch (error) {
      console.error("CapacitorGeolocation: Error getting position:", error);
      throw new Error(`Failed to get GPS position: ${error}`);
    }
  }

  /**
   * Watch position changes with high accuracy and adaptive timeout
   */
  async watchPosition(
    callback: (location: CapacitorLocation) => void,
  ): Promise<string> {
    // Clear any existing watch first
    if (this.watchId) {
      await this.clearWatch();
    }

    try {
      const timeout = this.getAdaptiveTimeout();
      console.log("CapacitorGeolocation: Starting position watch...", {
        timeout: `${timeout}ms`,
        averageFixTime: this.averageFixTime
          ? `${this.averageFixTime}ms`
          : "N/A",
      });

      let firstUpdate = true;
      const watchStartTime = Date.now();

      this.watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: timeout,
          maximumAge: 0,
        },
        (position, err) => {
          if (err) {
            console.error("CapacitorGeolocation: Watch position error:", err);
            return;
          }

          if (position) {
            const location: CapacitorLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy || 0,
              timestamp: position.timestamp,
              altitude: position.coords.altitude || undefined,
              altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
              heading: position.coords.heading || undefined,
              speed: position.coords.speed || undefined,
            };

            // Record fix time for first update
            if (firstUpdate) {
              const fixTime = Date.now() - watchStartTime;
              this.recordFixTime(fixTime);
              firstUpdate = false;
              console.log(
                "CapacitorGeolocation: First position update received:",
                {
                  lat: location.latitude,
                  lng: location.longitude,
                  accuracy: location.accuracy,
                  fixTime: `${fixTime}ms`,
                },
              );
            } else {
              console.log("CapacitorGeolocation: Position update:", {
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy,
              });
            }

            callback(location);
          }
        },
      );

      console.log(
        "CapacitorGeolocation: Position watch started with ID:",
        this.watchId,
      );
      return this.watchId;
    } catch (error) {
      console.error(
        "CapacitorGeolocation: Error starting position watch:",
        error,
      );
      throw new Error(`Failed to start position watch: ${error}`);
    }
  }

  /**
   * Stop watching position
   */
  async clearWatch(): Promise<void> {
    if (this.watchId) {
      try {
        await Geolocation.clearWatch({ id: this.watchId });
        console.log("CapacitorGeolocation: Position watch cleared");
        this.watchId = null;
      } catch (error) {
        console.error("CapacitorGeolocation: Error clearing watch:", error);
      }
    }
  }

  /**
   * Check if geolocation permissions are granted
   */
  async checkPermissions(): Promise<{ location: string }> {
    try {
      const permissions = await Geolocation.checkPermissions();
      console.log("CapacitorGeolocation: Permissions status:", permissions);
      return permissions;
    } catch (error) {
      console.error("CapacitorGeolocation: Error checking permissions:", error);
      return { location: "denied" };
    }
  }

  /**
   * Request geolocation permissions
   */
  async requestPermissions(): Promise<{ location: string }> {
    try {
      console.log("CapacitorGeolocation: Requesting permissions...");
      const permissions = await Geolocation.requestPermissions();
      console.log("CapacitorGeolocation: Permissions granted:", permissions);
      return permissions;
    } catch (error) {
      console.error(
        "CapacitorGeolocation: Error requesting permissions:",
        error,
      );
      return { location: "denied" };
    }
  }

  /**
   * Get cached position if available
   */
  async getCachedPosition(): Promise<CapacitorLocation | null> {
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000, // 5 minutes
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
        timestamp: position.timestamp,
        altitude: position.coords.altitude || undefined,
        altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
        heading: position.coords.heading || undefined,
        speed: position.coords.speed || undefined,
      };
    } catch (error) {
      console.log("CapacitorGeolocation: No cached position available");
      return null;
    }
  }
}

export default CapacitorGeolocationService;
