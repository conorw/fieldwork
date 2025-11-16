import { Camera, CameraResultType, CameraSource, PermissionStatus } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

export interface CameraOptions {
  quality?: number
  allowEditing?: boolean
  resultType?: CameraResultType
  source?: CameraSource
  width?: number
  height?: number
  correctOrientation?: boolean
  saveToGallery?: boolean
}

export interface CameraResult {
  dataUrl?: string
  path?: string
  webPath?: string
  format?: string
  saved?: boolean
}

export class CapacitorCameraService {
  private static instance: CapacitorCameraService

  static getInstance(): CapacitorCameraService {
    if (!CapacitorCameraService.instance) {
      CapacitorCameraService.instance = new CapacitorCameraService()
    }
    return CapacitorCameraService.instance
  }

  /**
   * Check if we're running on a native platform
   */
  private isNativePlatform(): boolean {
    return Capacitor.isNativePlatform()
  }

  /**
   * Check camera permissions
   */
  async checkPermissions(): Promise<PermissionStatus> {
    try {
      if (this.isNativePlatform()) {
        const permissions = await Camera.checkPermissions()
        console.log('CapacitorCamera: Native permissions status:', permissions)
        return permissions
      } else {
        // For web browsers, check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          return { camera: 'denied', photos: 'denied' }
        }
        return { camera: 'granted', photos: 'granted' }
      }
    } catch (error) {
      console.error('CapacitorCamera: Error checking permissions:', error)
      return { camera: 'denied', photos: 'denied' }
    }
  }

  /**
   * Request camera permissions
   */
  async requestPermissions(): Promise<PermissionStatus> {
    try {
      if (this.isNativePlatform()) {
        console.log('CapacitorCamera: Requesting native camera permissions...')
        const permissions = await Camera.requestPermissions()
        console.log('CapacitorCamera: Native permissions granted:', permissions)
        return permissions
      } else {
        // For web browsers, try to get camera access
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true })
          stream.getTracks().forEach(track => track.stop()) // Stop immediately
          console.log('CapacitorCamera: Web camera access granted')
          return { camera: 'granted', photos: 'granted' }
        } catch (error) {
          console.error('CapacitorCamera: Web camera access denied:', error)
          return { camera: 'denied', photos: 'denied' }
        }
      }
    } catch (error) {
      console.error('CapacitorCamera: Error requesting permissions:', error)
      return { camera: 'denied', photos: 'denied' }
    }
  }

  /**
   * Take a photo using web camera API (fallback for web browsers)
   */
  private async takePhotoWeb(): Promise<CameraResult> {
    return new Promise((resolve, reject) => {
      try {
        // First try to use the camera with getUserMedia
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          this.takePhotoWithCamera(resolve, reject)
        } else {
          // Fallback to file picker if camera is not available
          this.takePhotoWithFilePicker(resolve, reject)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Take photo using camera with getUserMedia
   */
  private async takePhotoWithCamera(resolve: Function, reject: Function) {
    try {
      console.log('CapacitorCamera: Attempting to use camera with getUserMedia')
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer rear camera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      })

      // Create video element
      const video = document.createElement('video')
      video.srcObject = stream
      video.autoplay = true
      video.muted = true
      video.playsInline = true
      video.style.width = '100%'
      video.style.height = 'auto'
      video.style.borderRadius = '8px'
      video.style.display = 'block'
      video.style.maxHeight = '400px'
      video.style.objectFit = 'cover'

      // Create modal overlay
      const modal = document.createElement('div')
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
      `

      // Create camera container
      const cameraContainer = document.createElement('div')
      cameraContainer.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 20px;
        max-width: 90%;
        max-height: 90%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      `

      // Create controls container
      const controlsContainer = document.createElement('div')
      controlsContainer.style.cssText = `
        display: flex;
        gap: 15px;
        align-items: center;
      `

      // Create capture button
      const captureButton = document.createElement('button')
      captureButton.textContent = 'Capture Photo'
      captureButton.style.cssText = `
        background: #3B82F6;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
      `

      // Create cancel button
      const cancelButton = document.createElement('button')
      cancelButton.textContent = 'Cancel'
      cancelButton.style.cssText = `
        background: #6B7280;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
      `

      // Add camera icon to capture button
      const cameraIcon = document.createElement('div')
      cameraIcon.innerHTML = `
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      `
      captureButton.appendChild(cameraIcon)

      // Assemble the modal
      cameraContainer.appendChild(video)
      cameraContainer.appendChild(controlsContainer)
      controlsContainer.appendChild(captureButton)
      controlsContainer.appendChild(cancelButton)
      modal.appendChild(cameraContainer)
      document.body.appendChild(modal)

      // Wait for video to be ready
      video.onloadedmetadata = () => {
        console.log('CapacitorCamera: Video ready, camera interface shown')
      }

      // Capture photo
      captureButton.onclick = () => {
        try {
          // Create canvas and capture frame
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            throw new Error('Could not get canvas context')
          }

          // Draw the video frame to canvas
          ctx.drawImage(video, 0, 0)

          // Convert to data URL
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9)

          // Clean up
          stream.getTracks().forEach(track => track.stop())
          document.body.removeChild(modal)

          console.log('CapacitorCamera: Photo captured successfully with camera')
          resolve({
            dataUrl: dataUrl,
            format: 'image/jpeg',
            saved: false
          })
        } catch (error) {
          console.error('CapacitorCamera: Error capturing photo:', error)
          stream.getTracks().forEach(track => track.stop())
          document.body.removeChild(modal)
          reject(new Error('Failed to capture photo'))
        }
      }

      // Cancel
      cancelButton.onclick = () => {
        stream.getTracks().forEach(track => track.stop())
        document.body.removeChild(modal)
        reject(new Error('User cancelled photo capture'))
      }

      // Close on background click
      modal.onclick = (e) => {
        if (e.target === modal) {
          stream.getTracks().forEach(track => track.stop())
          document.body.removeChild(modal)
          reject(new Error('User cancelled photo capture'))
        }
      }

    } catch (error) {
      console.error('CapacitorCamera: Camera access failed, falling back to file picker:', error)
      // Fallback to file picker
      this.takePhotoWithFilePicker(resolve, reject)
    }
  }

  /**
   * Take photo using file picker (fallback)
   */
  private takePhotoWithFilePicker(resolve: Function, reject: Function) {
    try {
      console.log('CapacitorCamera: Using file picker fallback')
      
      // Create a file input element
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.style.display = 'none'
      
      input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        
        // Clean up the input element
        try {
          if (document.body.contains(input)) {
            document.body.removeChild(input)
          }
        } catch (e) {
          // Input might already be removed
        }
        
        if (!file) {
          reject(new Error('No file selected'))
          return
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
          reject(new Error('Please select an image file'))
          return
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          reject(new Error('Please select an image smaller than 10MB'))
          return
        }

        // Convert to data URL
        const reader = new FileReader()
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string
          resolve({
            dataUrl: dataUrl,
            format: file.type,
            saved: false
          })
        }
        reader.onerror = () => {
          reject(new Error('Error reading file'))
        }
        reader.readAsDataURL(file)
      }

      // Add to DOM and trigger click
      document.body.appendChild(input)
      input.click()
      
      // Set up a timeout to detect if user takes too long
      setTimeout(() => {
        try {
          if (document.body.contains(input)) {
            document.body.removeChild(input)
          }
        } catch (e) {
          // Input might already be removed
        }
      }, 30000) // 30 second cleanup timeout
      
    } catch (error) {
      reject(error)
    }
  }

  /**
   * Pick photo from gallery using file picker (web browsers)
   */
  private pickFromGalleryWeb(): Promise<CameraResult> {
    return new Promise((resolve, reject) => {
      try {
        console.log('CapacitorCamera: Opening file picker for gallery selection')
        
        // Create a file input element
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.multiple = false // Only allow single file selection
        input.style.display = 'none'
        
        input.onchange = (event) => {
          const file = (event.target as HTMLInputElement).files?.[0]
          
          // Clean up the input element
          try {
            if (document.body.contains(input)) {
              document.body.removeChild(input)
            }
          } catch (e) {
            // Input might already be removed
          }
          
          if (!file) {
            reject(new Error('No file selected'))
            return
          }

          // Validate file type
          if (!file.type.startsWith('image/')) {
            reject(new Error('Please select an image file'))
            return
          }

          // Validate file size (max 10MB)
          if (file.size > 10 * 1024 * 1024) {
            reject(new Error('Please select an image smaller than 10MB'))
            return
          }

          // Convert to data URL
          const reader = new FileReader()
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string
            resolve({
              dataUrl: dataUrl,
              format: file.type,
              saved: false
            })
          }
          reader.onerror = () => {
            reject(new Error('Error reading file'))
          }
          reader.readAsDataURL(file)
        }

        // Add to DOM and trigger click
        document.body.appendChild(input)
        input.click()
        
        // Set up a timeout to detect if user takes too long
        setTimeout(() => {
          try {
            if (document.body.contains(input)) {
              document.body.removeChild(input)
            }
          } catch (e) {
            // Input might already be removed
          }
        }, 30000) // 30 second cleanup timeout
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Take a high-quality photo optimized for grave documentation
   */
  async takeGravePhoto(): Promise<CameraResult> {
    try {
      console.log('CapacitorCamera: Taking grave photo...')
      
      // Check permissions first
      const permission = await this.checkPermissions()
      if (permission.camera !== 'granted') {
        const newPermission = await this.requestPermissions()
        if (newPermission.camera !== 'granted') {
          throw new Error('Camera permission denied')
        }
      }

      if (this.isNativePlatform()) {
        // Use native Capacitor Camera
        const options = {
          quality: 90, // High quality for grave documentation
          allowEditing: true, // Allow user to crop/adjust
          resultType: CameraResultType.DataUrl, // Get base64 data
          source: CameraSource.Camera, // Force camera (not gallery)
          correctOrientation: true, // Auto-rotate if needed
          saveToGallery: true // Save to device gallery
        }

        const result = await Camera.getPhoto(options)
        
        console.log('CapacitorCamera: Native grave photo captured successfully')
        return {
          dataUrl: result.dataUrl,
          webPath: result.webPath,
          path: result.path,
          format: 'jpeg',
          saved: true
        }
      } else {
        // Use web camera API fallback
        console.log('CapacitorCamera: Using web camera fallback')
        const result = await this.takePhotoWeb()
        console.log('CapacitorCamera: Web grave photo captured successfully')
        return result
      }
    } catch (error) {
      console.error('CapacitorCamera: Error taking grave photo:', error)
      throw new Error(`Failed to take photo: ${error}`)
    }
  }

  /**
   * Take a photo with user choice of camera or gallery
   */
  async takePhotoWithChoice(): Promise<CameraResult> {
    try {
      console.log('CapacitorCamera: Taking photo with user choice...')
      
      // Check permissions first
      const permission = await this.checkPermissions()
      if (permission.camera !== 'granted') {
        const newPermission = await this.requestPermissions()
        if (newPermission.camera !== 'granted') {
          throw new Error('Camera permission denied')
        }
      }

      if (this.isNativePlatform()) {
        const options = {
          quality: 85,
          allowEditing: true,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt, // Let user choose camera or gallery
          correctOrientation: true,
          saveToGallery: true
        }

        const result = await Camera.getPhoto(options)
        
        console.log('CapacitorCamera: Native photo captured with user choice')
        return {
          dataUrl: result.dataUrl,
          webPath: result.webPath,
          path: result.path,
          format: 'jpeg',
          saved: true
        }
      } else {
        // Use web camera API fallback
        console.log('CapacitorCamera: Using web camera fallback for user choice')
        const result = await this.takePhotoWeb()
        console.log('CapacitorCamera: Web photo captured with user choice')
        return result
      }
    } catch (error) {
      console.error('CapacitorCamera: Error taking photo with choice:', error)
      throw new Error(`Failed to take photo: ${error}`)
    }
  }

  /**
   * Take a quick photo without editing (for fast capture)
   */
  async takeQuickPhoto(): Promise<CameraResult> {
    try {
      console.log('CapacitorCamera: Taking quick photo...')
      
      // Check permissions first
      const permission = await this.checkPermissions()
      if (permission.camera !== 'granted') {
        const newPermission = await this.requestPermissions()
        if (newPermission.camera !== 'granted') {
          throw new Error('Camera permission denied')
        }
      }

      if (this.isNativePlatform()) {
        const options = {
          quality: 80, // Slightly lower quality for speed
          allowEditing: false, // No editing for quick capture
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
          correctOrientation: true,
          saveToGallery: false // Don't save to gallery for quick photos
        }

        const result = await Camera.getPhoto(options)
        
        console.log('CapacitorCamera: Native quick photo captured')
        return {
          dataUrl: result.dataUrl,
          webPath: result.webPath,
          path: result.path,
          format: 'jpeg',
          saved: false
        }
      } else {
        // Use web camera API fallback
        console.log('CapacitorCamera: Using web camera fallback for quick photo')
        const result = await this.takePhotoWeb()
        console.log('CapacitorCamera: Web quick photo captured')
        return result
      }
    } catch (error) {
      console.error('CapacitorCamera: Error taking quick photo:', error)
      throw new Error(`Failed to take quick photo: ${error}`)
    }
  }

  /**
   * Pick photo from gallery
   */
  async pickFromGallery(): Promise<CameraResult> {
    try {
      console.log('CapacitorCamera: Picking photo from gallery...')
      
      if (this.isNativePlatform()) {
        const options = {
          quality: 90,
          allowEditing: true,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos, // Gallery only
          correctOrientation: true
        }

        const result = await Camera.getPhoto(options)
        
        console.log('CapacitorCamera: Native photo picked from gallery')
        return {
          dataUrl: result.dataUrl,
          webPath: result.webPath,
          path: result.path,
          format: 'jpeg',
          saved: false
        }
      } else {
        // Use web file picker fallback for gallery
        console.log('CapacitorCamera: Using web file picker fallback for gallery')
        const result = await this.pickFromGalleryWeb()
        console.log('CapacitorCamera: Web photo picked from gallery')
        return result
      }
    } catch (error) {
      console.error('CapacitorCamera: Error picking from gallery:', error)
      throw new Error(`Failed to pick photo from gallery: ${error}`)
    }
  }

  /**
   * Convert data URL to blob for upload
   */
  dataUrlToBlob(dataUrl: string): Blob {
    try {
      const arr = dataUrl.split(',')
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
      const bstr = atob(arr[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      
      return new Blob([u8arr], { type: mime })
    } catch (error) {
      console.error('CapacitorCamera: Error converting data URL to blob:', error)
      throw new Error('Failed to convert photo data')
    }
  }

  /**
   * Get photo info from data URL
   */
  getPhotoInfo(dataUrl: string): { size: number, format: string, dimensions?: { width: number, height: number } } {
    try {
      const arr = dataUrl.split(',')
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
      const bstr = atob(arr[1])
      const size = bstr.length
      
      // Try to get dimensions from the image
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          resolve({
            size,
            format: mime,
            dimensions: {
              width: img.width,
              height: img.height
            }
          })
        }
        img.onerror = () => {
          resolve({
            size,
            format: mime
          })
        }
        img.src = dataUrl
      }) as any
    } catch (error) {
      console.error('CapacitorCamera: Error getting photo info:', error)
      return {
        size: 0,
        format: 'unknown'
      }
    }
  }
}

export default CapacitorCameraService
