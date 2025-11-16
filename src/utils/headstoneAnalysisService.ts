// Service for analyzing headstone images and creating person records
import { usePersonsStore } from '../stores/persons'
import { usePowerSyncStore } from '../stores/powersync'
import { useSettingsStore } from '../stores/settings'
import { localLLMService } from '../services/localLLMService'
import type { PersonData } from '../stores/persons'

export interface HeadstoneAnalysisResult {
  success: boolean
  persons: PersonData[]
  full_text_transcription?: string
  raw_analysis?: string
  error?: string
  metadata?: {
    analysis_timestamp: string
    model_used: string
    confidence_level: string
  }
}

export class HeadstoneAnalysisService {
  private readonly API_ENDPOINT = '/api/analyze-headstone'
  //private readonly API_ENDPOINT = '/api/analyze-headstone'
  
  // Lazy-loaded stores to avoid Pinia initialization issues
  private get personsStore() {
    return usePersonsStore()
  }
  
  private get powerSyncStore() {
    return usePowerSyncStore()
  }

  private get settingsStore() {
    return useSettingsStore()
  }

  // Store analysis results for later processing when plot is created
  private async storeAnalysisResultsForLater(tempPlotId: string, analysisData: any, personData: PersonData[]) {
    try {
      // Store in localStorage as a fallback
      const storedResults = {
        tempPlotId,
        analysisData,
        personData,
        timestamp: Date.now()
      }
      
      const existingResults = JSON.parse(localStorage.getItem('pendingAnalysisResults') || '[]')
      existingResults.push(storedResults)
      localStorage.setItem('pendingAnalysisResults', JSON.stringify(existingResults))
      
      console.log(`HeadstoneAnalysisService: Stored analysis results for temp plot ID: ${tempPlotId}`)
    } catch (error) {
      console.error('Error storing analysis results:', error)
    }
  }

  // Process stored analysis results when a plot is created
  public async processStoredResultsForPlot(plotId: string, tempPlotId: string) {
    try {
      const storedResults = JSON.parse(localStorage.getItem('pendingAnalysisResults') || '[]')
      const resultIndex = storedResults.findIndex((result: any) => result.tempPlotId === tempPlotId)
      
      if (resultIndex !== -1) {
        const result = storedResults[resultIndex]
        console.log(`HeadstoneAnalysisService: Processing stored results for plot ${plotId}`)
        
        // Update plot notes
        if (result.analysisData.full_text_transcription) {
          await this.powerSyncStore.updateExistingPlot(plotId, {
            notes: result.analysisData.full_text_transcription
          })
        }
        
        // Create persons
        if (result.personData && result.personData.length > 0) {
          for (const person of result.personData) {
            try {
              const createdPerson = await this.personsStore.createPerson({
                ...person,
                plot_id: plotId
              })
              if (createdPerson) {
                console.log(`HeadstoneAnalysisService: Created person ${createdPerson.full_name}`)
              }
            } catch (error) {
              console.error('Error creating person record:', error)
            }
          }
        }
        
        // Remove processed result
        storedResults.splice(resultIndex, 1)
        localStorage.setItem('pendingAnalysisResults', JSON.stringify(storedResults))
        
        console.log(`HeadstoneAnalysisService: Completed processing stored results for plot ${plotId}`)
      }
    } catch (error) {
      console.error('Error processing stored results:', error)
    }
  }
  /**
   * Analyze a headstone image and create person records
   */
  async analyzeHeadstoneImage(
    imageFile: File,
    tempPlotId: string,
  ): Promise<HeadstoneAnalysisResult> {
    try {
      console.log('HeadstoneAnalysisService: Starting headstone analysis...')
      console.log('HeadstoneAnalysisService: Image file:', {
        name: imageFile.name,
        size: imageFile.size,
        type: imageFile.type
      })

      // Get current analysis mode
      const analysisMode = this.settingsStore.getAnalysisMode()
      console.log('HeadstoneAnalysisService: Using analysis mode:', analysisMode)

      // Convert image to base64 with client-side compression for faster upload
      // This reduces upload time and API processing time
      const base64Data = await this.fileToBase64(imageFile, true)

      let analysisData: any

      // Route to appropriate service based on mode
      if (analysisMode === 'local') {
        console.log('HeadstoneAnalysisService: Using local LLM service')
        try {
          const localResult = await localLLMService.analyzeImage(imageFile, base64Data)
          analysisData = {
            success: localResult.success,
            persons: localResult.persons,
            full_text_transcription: localResult.full_text_transcription,
            metadata: localResult.metadata
          }
          console.log('HeadstoneAnalysisService: Local analysis completed:', analysisData)
        } catch (localError) {
          const errorMsg = localError instanceof Error ? localError.message : 'Unknown error'
          console.error('HeadstoneAnalysisService: Local analysis failed:', localError)
          
          // Do not fallback to OpenAI - throw the error instead
          throw new Error(`Local model analysis failed: ${errorMsg}`)
        }
      } else {
        // Use OpenAI API (default)
        console.log('HeadstoneAnalysisService: Using OpenAI API')
        // Use JPEG mimeType since we compress to JPEG on client side
        const mimeType = imageFile.size > 200 * 1024 ? 'image/jpeg' : (imageFile.type || 'image/jpeg')
        analysisData = await this.analyzeWithOpenAI(base64Data, mimeType)
      }

      // Validate response structure
      if (!analysisData.success || !Array.isArray(analysisData.persons)) {
        throw new Error('Invalid response format from analysis API')
      }

      // Convert API response to PersonData format and associate with plot
      const personData: PersonData[] = analysisData.persons.map((person: any) => this.convertToPersonData(person, tempPlotId))

      // if the plot already exists, update the plot notes and create persons
      if (personData.length > 0) {
        console.log(`HeadstoneAnalysisService: Processing analysis results for temp plot ID: ${tempPlotId}`)

        // find the plot using the temp plot id
        const plot = await this.powerSyncStore.findPlotByTempId(tempPlotId)
        if (plot) {
          console.log(`HeadstoneAnalysisService: Found plot ${plot.id}, updating notes and creating persons...`)
          const plotId = plot.id
          await this.powerSyncStore.updateExistingPlot(plotId, {
            ...plot,
            notes: analysisData.full_text_transcription
          })
          if (personData.length > 0) {
            console.log(`HeadstoneAnalysisService: Creating ${personData.length} person(s) automatically...`)
            for (const person of personData) {
              try {
                const createdPerson = await this.personsStore.createPerson({
                  ...person,
                  plot_id: plotId
                })
                if (createdPerson) {
                  console.log(`HeadstoneAnalysisService: Created person ${createdPerson.full_name}`)
                }
              } catch (error) {
                console.error('Error creating person record:', error)
              }
            }
          }
        } else {
          console.log(`HeadstoneAnalysisService: Plot not found for temp ID ${tempPlotId}, storing results for later processing...`)
          // Store the analysis results for when the plot is created
          await this.storeAnalysisResultsForLater(tempPlotId, analysisData, personData)
        }
      }

      return {
        success: true,
        persons: personData,
        full_text_transcription: analysisData.full_text_transcription,
        metadata: analysisData.metadata
      }

    } catch (error) {
      console.error('HeadstoneAnalysisService: Analysis failed:', error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      // Handle specific OpenAI API errors gracefully
      let friendlyError = errorMessage

      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('billing')) {
        friendlyError = 'OpenAI quota exceeded - analysis unavailable'
        console.log('HeadstoneAnalysisService: OpenAI quota exceeded, skipping analysis silently')
      } else if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
        friendlyError = 'OpenAI API key issue - analysis unavailable'
        console.log('HeadstoneAnalysisService: OpenAI API key issue, skipping analysis silently')
      }

      return {
        success: false,
        persons: [],
        error: friendlyError
      }
    }
  }

  /**
   * Convert API response format to PersonData format
   */
  private convertToPersonData(apiPerson: any, plotId: string): PersonData {
    const now = new Date().toISOString()

    // Generate full name from forename and surname for minimal API
    const fullName = [apiPerson.forename || '', apiPerson.surname || ''].filter(Boolean).join(' ')

    return {
      id: '', // Will be generated by createPerson
      plot_id: plotId,
      title: apiPerson.title || '',
      forename: apiPerson.forename || '',
      middle_name: apiPerson.middle_name || '',
      surname: apiPerson.surname || '',
      full_name: apiPerson.full_name || fullName,
      known_as: apiPerson.known_as || '',
      maiden_name: apiPerson.maiden_name || '',

      // Personal details
      gender: apiPerson.gender || '',
      date_of_birth: apiPerson.date_of_birth || '',
      date_of_death: apiPerson.date_of_death || '',
      age_at_death: apiPerson.age_at_death || null,
      time_of_death: apiPerson.time_of_death || null,

      // Location information
      birth_city: apiPerson.birth_city || '',
      birth_sub_country: apiPerson.birth_sub_country || '',
      birth_country: apiPerson.birth_country || '',
      address_line1: apiPerson.address_line1 || '',
      address_line2: apiPerson.address_line2 || '',
      town: apiPerson.town || '',
      county: apiPerson.county || '',
      country: apiPerson.country || '',
      postcode: apiPerson.postcode || '',

      // Contact information (empty for headstones)
      mobile: '',
      landline: '',
      email_address: '',

      // Personal characteristics
      marital_status: apiPerson.marital_status || '',
      race: apiPerson.race || '',
      ethnicity: apiPerson.ethnicity || '',

      // Status flags
      deceased: true, // Always true for headstones
      person_of_interest: apiPerson.person_of_interest || false,
      veteran: apiPerson.veteran || false,

      // Death information
      cause_of_death: apiPerson.cause_of_death || '',

      // Additional notes
      notes: apiPerson.notes || '',

      // Metadata
      created_by: 'headstone-analysis',
      date_created: now,
      last_updated_by: 'headstone-analysis',
      last_updated_datetime: now
    }
  }

  /**
   * Analyze with OpenAI API
   */
  private async analyzeWithOpenAI(base64Data: string, mimeType: string): Promise<any> {
    // Prepare request data
    const requestData = {
      imageData: base64Data,
      mimeType: mimeType
    }

    console.log('HeadstoneAnalysisService: Making API request to:', this.API_ENDPOINT)

    // Call the headstone analysis API
    const response = await fetch(this.API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData)
    })

    console.log('HeadstoneAnalysisService: Response:', response)
    if (!response.ok) {
      // Try to parse error response as JSON, fallback to text
      let errorMessage = `API request failed with status ${response.status}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch (jsonError) {
        // If JSON parsing fails, try to get text content
        try {
          const errorText = await response.text()
          errorMessage = errorText || errorMessage
        } catch (textError) {
          console.error('Could not parse error response:', textError)
        }
      }
      throw new Error(errorMessage)
    }

    // Try to parse response as JSON
    let analysisData
    try {
      analysisData = await response.json()
      console.log('HeadstoneAnalysisService: Analysis completed:', analysisData)
    } catch (jsonError) {
      // If JSON parsing fails, try to get text content to see what we received
      const responseText = await response.text()
      console.error('HeadstoneAnalysisService: Failed to parse JSON response:', responseText)
      throw new Error(`Invalid JSON response from API: ${responseText.substring(0, 100)}...`)
    }

    return analysisData
  }

  /**
   * Compress and resize image on client side before sending to API
   * This reduces upload time and API processing time
   */
  private async compressImageForAPI(file: File): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        // Resize to max 1024px on longest side (same as server-side compression)
        // This reduces upload time significantly
        const MAX_DIMENSION = 1024
        let width = img.width
        let height = img.height

        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height / width) * MAX_DIMENSION)
          width = MAX_DIMENSION
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width / height) * MAX_DIMENSION)
          height = MAX_DIMENSION
        }

        canvas.width = width
        canvas.height = height

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to JPEG with 85% quality (good balance)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }

            // Convert blob to base64
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              const base64 = result.split(',')[1]
              resolve({ base64, mimeType: 'image/jpeg' })
            }
            reader.onerror = reject
            reader.readAsDataURL(blob)
          },
          'image/jpeg',
          0.85
        )
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  /**
   * Convert File to base64 (with optional compression)
   */
  private async fileToBase64(file: File, compress: boolean = true): Promise<string> {
    // If file is small (< 200KB) and compression disabled, use direct conversion
    if (!compress || file.size < 200 * 1024) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remove the data URL prefix (data:image/jpeg;base64,) 
          const base64 = result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    }

    // Compress larger images
    const compressed = await this.compressImageForAPI(file)
    return compressed.base64
  }
}

// Export singleton instance
export const headstoneAnalysisService = new HeadstoneAnalysisService()
