import { Geolocation } from '@capacitor/geolocation'

export interface CapacitorLocation {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
  altitude?: number
  altitudeAccuracy?: number
  heading?: number
  speed?: number
}

export class CapacitorGeolocationService {
  private static instance: CapacitorGeolocationService
  private watchId: string | null = null

  static getInstance(): CapacitorGeolocationService {
    if (!CapacitorGeolocationService.instance) {
      CapacitorGeolocationService.instance = new CapacitorGeolocationService()
    }
    return CapacitorGeolocationService.instance
  }

  /**
   * Get current position with high accuracy
   */
  async getCurrentPosition(): Promise<CapacitorLocation> {
    try {
      console.log('CapacitorGeolocation: Requesting high accuracy position...')
      
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 30000, // 30 seconds timeout
        maximumAge: 0 // Don't use cached position
      })

      const location: CapacitorLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
        timestamp: position.timestamp,
        altitude: position.coords.altitude || undefined,
        altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
        heading: position.coords.heading || undefined,
        speed: position.coords.speed || undefined
      }

      console.log('CapacitorGeolocation: High accuracy position obtained:', {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        altitude: location.altitude
      })

      return location
    } catch (error) {
      console.error('CapacitorGeolocation: Error getting position:', error)
      throw new Error(`Failed to get GPS position: ${error}`)
    }
  }

  /**
   * Watch position changes with high accuracy
   */
  async watchPosition(callback: (location: CapacitorLocation) => void): Promise<string> {
    try {
      console.log('CapacitorGeolocation: Starting position watch...')
      
      this.watchId = await Geolocation.watchPosition({
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
      }, (position, err) => {
        if (err) {
          console.error('CapacitorGeolocation: Watch position error:', err)
          return
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
            speed: position.coords.speed || undefined
          }

          console.log('CapacitorGeolocation: Position update:', {
            lat: location.latitude,
            lng: location.longitude,
            accuracy: location.accuracy
          })

          callback(location)
        }
      })

      console.log('CapacitorGeolocation: Position watch started with ID:', this.watchId)
      return this.watchId
    } catch (error) {
      console.error('CapacitorGeolocation: Error starting position watch:', error)
      throw new Error(`Failed to start position watch: ${error}`)
    }
  }

  /**
   * Stop watching position
   */
  async clearWatch(): Promise<void> {
    if (this.watchId) {
      try {
        await Geolocation.clearWatch({ id: this.watchId })
        console.log('CapacitorGeolocation: Position watch cleared')
        this.watchId = null
      } catch (error) {
        console.error('CapacitorGeolocation: Error clearing watch:', error)
      }
    }
  }

  /**
   * Check if geolocation permissions are granted
   */
  async checkPermissions(): Promise<{ location: string }> {
    try {
      const permissions = await Geolocation.checkPermissions()
      console.log('CapacitorGeolocation: Permissions status:', permissions)
      return permissions
    } catch (error) {
      console.error('CapacitorGeolocation: Error checking permissions:', error)
      return { location: 'denied' }
    }
  }

  /**
   * Request geolocation permissions
   */
  async requestPermissions(): Promise<{ location: string }> {
    try {
      console.log('CapacitorGeolocation: Requesting permissions...')
      const permissions = await Geolocation.requestPermissions()
      console.log('CapacitorGeolocation: Permissions granted:', permissions)
      return permissions
    } catch (error) {
      console.error('CapacitorGeolocation: Error requesting permissions:', error)
      return { location: 'denied' }
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
        maximumAge: 300000 // 5 minutes
      })

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
        timestamp: position.timestamp,
        altitude: position.coords.altitude || undefined,
        altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
        heading: position.coords.heading || undefined,
        speed: position.coords.speed || undefined
      }
    } catch (error) {
      console.log('CapacitorGeolocation: No cached position available')
      return null
    }
  }
}

export default CapacitorGeolocationService
