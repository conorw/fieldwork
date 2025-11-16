import { ref } from 'vue'

export function useDeviceOrientation() {
  const userDirection = ref(0)
  let orientationListenerHandle: ((event: DeviceOrientationEvent) => void) | null = null
  let initialAlpha: number | null = null
  let useAbsoluteEvent = false

  const startOrientationListener = async () => {
    try {
      // Remove existing listener if any
      if (orientationListenerHandle) {
        const eventName = useAbsoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation'
        window.removeEventListener(eventName, orientationListenerHandle)
        orientationListenerHandle = null
      }

      initialAlpha = null

      // Request permission for iOS 13+
      const DeviceOrientationEventConstructor = DeviceOrientationEvent as any
      console.log('DeviceOrientationEventConstructor:', DeviceOrientationEventConstructor)
      if (typeof DeviceOrientationEventConstructor.requestPermission === 'function') {
        const permission = await DeviceOrientationEventConstructor.requestPermission()
        if (permission !== 'granted') {
          console.error('Device orientation permission denied')
          return
        }
      }

      // Check if deviceorientationabsolute is available and its not localhost
      useAbsoluteEvent = 'ondeviceorientationabsolute' in window
      const eventName = useAbsoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation'

      // Add native device orientation listener
      orientationListenerHandle = (event: DeviceOrientationEvent) => {
        if (event.alpha !== null && event.alpha !== undefined) {
          let heading = event.alpha

          // Check for webkitCompassHeading (iOS absolute heading)
          const compassHeading = (event as any).webkitCompassHeading
          if (typeof compassHeading !== 'undefined') {
            heading = compassHeading
          }
          // Check if absolute readings are available
          else if (event.absolute) {
            heading = (360 - event.alpha) % 360
          }
          // Relative readings - use baseline approach
          else {
            if (initialAlpha === null) {
              initialAlpha = event.alpha
              heading = event.alpha % 360
            } else {
              heading = (event.alpha - initialAlpha + 360) % 360
            }
          }

          userDirection.value = heading

        }
      }

      window.addEventListener(eventName, orientationListenerHandle, true)
    } catch (error) {
      console.error('Error starting orientation listener:', error)
    }
  }

  const stopOrientationListener = () => {
    if (orientationListenerHandle) {
      const eventName = useAbsoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation'
      window.removeEventListener(eventName, orientationListenerHandle)
      orientationListenerHandle = null
    }
  }

  return {
    userDirection,
    startOrientationListener,
    stopOrientationListener
  }
}

