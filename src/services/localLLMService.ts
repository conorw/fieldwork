// Local browser-based LLM service for headstone analysis
// Uses a two-step approach: Vision model for image understanding + Text generation for structured output
import { pipeline, env } from '@xenova/transformers'
import type { HeadstoneAnalysisResult } from '../utils/headstoneAnalysisService'
import type { PersonData } from '../stores/persons'

// Configure Transformers.js to use remote models from Hugging Face
env.allowLocalModels = false
env.allowRemoteModels = true

interface ModelState {
  isLoaded: boolean
  isLoading: boolean
  loadProgress: number
  error: string | null
  ocrPipeline: any | null
  visionPipeline: any | null
  textPipeline: any | null
}

class LocalLLMService {
  private modelState: ModelState = {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    error: null,
    ocrPipeline: null,
    visionPipeline: null,
    textPipeline: null
  }

  // Using publicly available Xenova models that are pre-converted for Transformers.js
  // OCR model: For extracting text from images
  private readonly OCR_MODEL = 'Xenova/trocr-small-printed'
  // Vision-language model: For understanding image content and describing what's seen
  private readonly VISION_MODEL = 'Xenova/vit-gpt2-image-captioning'
  // Text generation model: For creating structured JSON output
  private readonly TEXT_MODEL = 'Xenova/gpt2'

  /**
   * Initialize and load both vision and text models
   */
  async initialize(): Promise<void> {
    if (this.modelState.isLoaded) {
      console.log('LocalLLMService: Models already loaded')
      return
    }

    if (this.modelState.isLoading) {
      console.log('LocalLLMService: Models are already loading, waiting...')
      while (this.modelState.isLoading && !this.modelState.isLoaded) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return
    }

    this.modelState.isLoading = true
    this.modelState.error = null
    this.modelState.loadProgress = 0

    try {
      console.log('🚀 LocalLLMService: Starting model initialization...')
      console.log('📦 LocalLLMService: OCR model:', this.OCR_MODEL)
      console.log('📦 LocalLLMService: Vision model:', this.VISION_MODEL)
      console.log('📦 LocalLLMService: Text model:', this.TEXT_MODEL)
      
      // Create a progress callback
      const progressCallback = (progress: any) => {
        if (progress.progress !== undefined) {
          // Split progress between OCR (0-33%), vision (33-66%), and text (66-100%) models
          const modelProgress = progress.progress * 0.33
          if (progress.model === this.OCR_MODEL) {
            this.modelState.loadProgress = modelProgress * 100
          } else if (progress.model === this.VISION_MODEL) {
            this.modelState.loadProgress = 33 + (modelProgress * 100)
          } else if (progress.model === this.TEXT_MODEL) {
            this.modelState.loadProgress = 66 + (modelProgress * 100)
          }
          console.log(`📥 LocalLLMService: Downloading models... ${this.modelState.loadProgress.toFixed(1)}%`)
        }
        if (progress.status) {
          console.log(`📥 LocalLLMService: ${progress.status}`)
        }
      }

      // Load OCR model (text extraction from images)
      console.log('🔍 LocalLLMService: Loading OCR model for text extraction...')
      this.modelState.ocrPipeline = await pipeline(
        'image-to-text',
        this.OCR_MODEL,
        {
          progress_callback: progressCallback
        }
      )
      console.log('✅ LocalLLMService: OCR model loaded')

      // Load vision-language model (image understanding)
      console.log('👁️ LocalLLMService: Loading vision-language model for image understanding...')
      this.modelState.visionPipeline = await pipeline(
        'image-to-text',
        this.VISION_MODEL,
        {
          progress_callback: progressCallback
        }
      )
      console.log('✅ LocalLLMService: Vision model loaded')

      // Load text generation model (for structured output)
      console.log('📝 LocalLLMService: Loading text generation model...')
      this.modelState.textPipeline = await pipeline(
        'text-generation',
        this.TEXT_MODEL,
        {
          progress_callback: progressCallback
        }
      )
      console.log('✅ LocalLLMService: Text model loaded')

      this.modelState.isLoaded = true
      this.modelState.isLoading = false
      this.modelState.loadProgress = 100
      console.log('✅ LocalLLMService: All models loaded successfully!')
      console.log('✅ LocalLLMService: Ready for headstone analysis')
    } catch (error) {
      console.error('❌ LocalLLMService: Error loading models:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Provide user-friendly error messages
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        this.modelState.error = 'Model not publicly available. The selected model requires authentication or is not accessible.'
        console.error('❌ LocalLLMService: Model access denied (401). This model may not be publicly available.')
      } else if (errorMessage.includes('404') || errorMessage.includes('Not Found') || errorMessage.includes('Could not locate file')) {
        this.modelState.error = `Model not found: The selected model does not have the required files or may not exist.`
        console.error('❌ LocalLLMService: Model file not found (404).')
      } else if (errorMessage.includes('ERR_NAME_NOT_RESOLVED') || errorMessage.includes('Failed to fetch') || errorMessage.includes('Network error')) {
        this.modelState.error = 'Network error: Unable to download models from Hugging Face. Please check your internet connection and try again.'
        console.error('❌ LocalLLMService: Network/DNS error. Check internet connection.')
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        this.modelState.error = 'Access denied: The model may require authentication or special permissions.'
        console.error('❌ LocalLLMService: Model access denied (403).')
      } else {
        this.modelState.error = errorMessage
      }
      
      this.modelState.isLoading = false
      this.modelState.isLoaded = false
      throw error
    }
  }

  /**
   * Analyze a headstone image using vision model + text generation
   */
  async analyzeImage(
    imageFile: File,
    base64Data: string
  ): Promise<HeadstoneAnalysisResult> {
    try {
      // Ensure models are loaded
      if (!this.modelState.isLoaded) {
        console.log('🔄 LocalLLMService: Models not loaded, initializing now...')
        await this.initialize()
      } else {
        console.log('✅ LocalLLMService: Models already loaded, ready to analyze')
      }

      if (!this.modelState.ocrPipeline || !this.modelState.visionPipeline || !this.modelState.textPipeline) {
        throw new Error('Models not available')
      }

      console.log('🔍 LocalLLMService: Processing image...')

      // Preprocess image for better OCR results
      const processedImage = await this.preprocessImageForOCR(base64Data, imageFile.type)
      const imageUrl = URL.createObjectURL(processedImage)

      // Step 1: Extract text using OCR model
      console.log('📸 LocalLLMService: Extracting text using OCR...')
      const ocrResult = await this.modelState.ocrPipeline(imageUrl)
      
      let ocrText = ''
      if (Array.isArray(ocrResult) && ocrResult.length > 0) {
        ocrText = ocrResult[0]?.generated_text || ocrResult.map((r: any) => r.generated_text || r.text || '').join('\n')
      } else if (ocrResult?.generated_text) {
        ocrText = ocrResult.generated_text
      } else if (typeof ocrResult === 'string') {
        ocrText = ocrResult
      }

      // Step 2: Get image description using vision-language model
      console.log('👁️ LocalLLMService: Getting image description...')
      const visionResult = await this.modelState.visionPipeline(imageUrl)
      
      let imageDescription = ''
      if (Array.isArray(visionResult) && visionResult.length > 0) {
        imageDescription = visionResult[0]?.generated_text || visionResult.map((r: any) => r.generated_text || r.text || '').join('\n')
      } else if (visionResult?.generated_text) {
        imageDescription = visionResult.generated_text
      } else if (typeof visionResult === 'string') {
        imageDescription = visionResult
      }

      URL.revokeObjectURL(imageUrl)

      console.log('📋 LocalLLMService: OCR extracted text:', ocrText)
      console.log('📋 LocalLLMService: Image description:', imageDescription)

      // Combine OCR text and image description for better context
      // Use OCR text as primary, but supplement with image description
      let extractedText = ocrText.trim()
      if (imageDescription && imageDescription.trim().length > 0) {
        // If OCR is poor quality, use image description as fallback
        if (extractedText.length < 10 || this.isGarbledText(extractedText)) {
          console.log('⚠️ LocalLLMService: OCR text appears garbled, using image description')
          extractedText = imageDescription.trim()
        } else {
          // Combine both for better context
          extractedText = `${extractedText}\n\nImage context: ${imageDescription}`
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text could be extracted from the image')
      }

      // Step 2: Generate structured JSON output using text generation model
      console.log('🤖 LocalLLMService: Generating structured output...')
      const structuredPrompt = this.createStructuredPrompt(extractedText)
      
      const textResult = await this.modelState.textPipeline(structuredPrompt, {
        max_new_tokens: 1024,
        temperature: 0.1,
        return_full_text: false,
        do_sample: false
      })

      // Extract generated text
      let generatedText = ''
      if (Array.isArray(textResult) && textResult.length > 0) {
        generatedText = textResult[0]?.generated_text || textResult.map((r: any) => r.generated_text || '').join('\n')
      } else if (textResult?.generated_text) {
        generatedText = textResult.generated_text
      } else if (typeof textResult === 'string') {
        generatedText = textResult
      }

      // Remove the prompt from the output
      const generatedOnly = generatedText.startsWith(structuredPrompt)
        ? generatedText.slice(structuredPrompt.length).trim()
        : generatedText.trim()

      console.log('📋 LocalLLMService: Generated structured output:', generatedOnly)

      return this.parseStructuredOutput(generatedOnly, extractedText)

    } catch (error) {
      console.error('LocalLLMService: Error analyzing image:', error)
      throw error
    }
  }

  /**
   * Create a prompt for structured JSON generation based on extracted text
   */
  private createStructuredPrompt(extractedText: string): string {
    return `Extract deceased person information from this headstone text and return ONLY valid JSON.

Headstone text:
${extractedText}

Analyze the text and extract:
1. Complete transcription of all visible text (preserve line breaks)
2. All deceased persons mentioned with their details
3. Names, dates, relationships, epitaphs, and any other information

Return a JSON object with this exact structure:
{
  "full_text_transcription": "Complete transcription of all text visible on the headstone, preserving line breaks",
  "persons": [
    {
      "title": "",
      "forename": "",
      "middle_name": "",
      "surname": "",
      "full_name": "",
      "known_as": "",
      "maiden_name": "",
      "gender": "",
      "date_of_birth": "",
      "date_of_death": "",
      "age_at_death": null,
      "time_of_death": "",
      "birth_city": "",
      "birth_sub_country": "",
      "birth_country": "",
      "address_line1": "",
      "address_line2": "",
      "town": "",
      "county": "",
      "country": "",
      "postcode": "",
      "mobile": "",
      "landline": "",
      "email_address": "",
      "marital_status": "",
      "race": "",
      "ethnicity": "",
      "deceased": true,
      "person_of_interest": false,
      "veteran": false,
      "cause_of_death": "",
      "notes": ""
    }
  ]
}

Rules:
- Use empty strings "" for missing data
- Set deceased=true for all persons
- Include epitaphs, relationships, and memorial messages in notes field
- Extract dates in YYYY-MM-DD format if possible
- Calculate age_at_death from dates if available
- Parse names carefully (first, middle, last, maiden names)
- Return ONLY the JSON object, no other text or explanation

JSON:`
  }

  /**
   * Parse structured JSON output and convert to HeadstoneAnalysisResult format
   */
  private parseStructuredOutput(
    generatedText: string,
    extractedText: string
  ): HeadstoneAnalysisResult {
    try {
      // Try to extract JSON from the generated text
      let parsedData: any = null
      
      // Look for JSON object in the output
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsedData = JSON.parse(jsonMatch[0])
          console.log('✅ LocalLLMService: Successfully parsed structured JSON')
        } catch (parseError) {
          console.warn('LocalLLMService: Failed to parse JSON, using fallback')
        }
      }

      // If parsing failed, create a basic structure from extracted text
      if (!parsedData) {
        console.warn('⚠️ LocalLLMService: Could not parse structured JSON, using extracted text only')
        parsedData = {
          full_text_transcription: extractedText,
          persons: []
        }
      }

      // Ensure required fields exist
      if (!parsedData.full_text_transcription) {
        parsedData.full_text_transcription = extractedText
      }
      if (!Array.isArray(parsedData.persons)) {
        parsedData.persons = []
      }

      // Convert to PersonData format
      const persons: PersonData[] = parsedData.persons.map((person: any) => ({
        id: '',
        plot_id: '',
        title: person.title || '',
        forename: person.forename || '',
        middle_name: person.middle_name || '',
        surname: person.surname || '',
        full_name: person.full_name || `${person.forename || ''} ${person.surname || ''}`.trim() || 'Unknown',
        known_as: person.known_as || '',
        maiden_name: person.maiden_name || '',
        gender: person.gender || '',
        date_of_birth: person.date_of_birth || '',
        date_of_death: person.date_of_death || '',
        age_at_death: person.age_at_death || null,
        time_of_death: person.time_of_death || '',
        birth_city: person.birth_city || '',
        birth_sub_country: person.birth_sub_country || '',
        birth_country: person.birth_country || '',
        address_line1: person.address_line1 || '',
        address_line2: person.address_line2 || '',
        town: person.town || '',
        county: person.county || '',
        country: person.country || '',
        postcode: person.postcode || '',
        mobile: person.mobile || '',
        landline: person.landline || '',
        email_address: person.email_address || '',
        marital_status: person.marital_status || '',
        race: person.race || '',
        ethnicity: person.ethnicity || '',
        deceased: person.deceased !== undefined ? person.deceased : true,
        person_of_interest: person.person_of_interest || false,
        veteran: person.veteran || false,
        cause_of_death: person.cause_of_death || '',
        notes: person.notes || '',
        created_by: 'local-llm',
        date_created: new Date().toISOString(),
        last_updated_by: 'local-llm',
        last_updated_datetime: new Date().toISOString()
      }))

      return {
        success: true,
        persons,
        full_text_transcription: parsedData.full_text_transcription,
        raw_analysis: generatedText,
        metadata: {
          analysis_timestamp: new Date().toISOString(),
          model_used: `${this.OCR_MODEL} + ${this.VISION_MODEL} + ${this.TEXT_MODEL}`,
          confidence_level: 'medium'
        }
      }
    } catch (error) {
      console.error('LocalLLMService: Error parsing structured output:', error)
      throw new Error(`Failed to parse structured output: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Check if text appears to be garbled/nonsensical
   */
  private isGarbledText(text: string): boolean {
    // Check for repeated words, excessive special characters, or very short words
    const words = text.split(/\s+/)
    const repeatedWords = new Set()
    let garbledScore = 0
    
    for (const word of words) {
      if (repeatedWords.has(word.toLowerCase())) {
        garbledScore++
      }
      repeatedWords.add(word.toLowerCase())
      
      // Check for excessive special characters or very short words
      if (word.length < 2 && word.length > 0) {
        garbledScore++
      }
    }
    
    // If more than 30% of words are repeated or very short, likely garbled
    return garbledScore > words.length * 0.3
  }

  /**
   * Preprocess image for better OCR results
   * Enhances contrast and prepares image for text extraction
   */
  private async preprocessImageForOCR(base64Data: string, mimeType: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        // Set canvas size to image size
        canvas.width = img.width
        canvas.height = img.height

        // Draw image
        ctx.drawImage(img, 0, 0)

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        // Enhanced preprocessing for headstone images
        // Apply grayscale, increase contrast, and sharpen edges
        for (let i = 0; i < data.length; i += 4) {
          // Convert to grayscale using luminance formula
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
          
          // Increase contrast significantly (2.0x) for engraved text
          const contrast = 2.0
          const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255))
          let newGray = Math.min(255, Math.max(0, factor * (gray - 128) + 128))
          
          // Apply threshold to make text more distinct (binarization effect)
          // This helps with engraved text that has shadows
          const threshold = 128
          if (newGray < threshold) {
            newGray = Math.max(0, newGray - 30) // Make dark areas darker
          } else {
            newGray = Math.min(255, newGray + 30) // Make light areas lighter
          }
          
          // Set RGB to grayscale value
          data[i] = newGray
          data[i + 1] = newGray
          data[i + 2] = newGray
          // Alpha stays the same
        }

        // Apply sharpening filter to enhance text edges
        const sharpenKernel = [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ]
        const tempData = new Uint8ClampedArray(data)
        for (let y = 1; y < canvas.height - 1; y++) {
          for (let x = 1; x < canvas.width - 1; x++) {
            let r = 0, g = 0, b = 0
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * canvas.width + (x + kx)) * 4
                const kernelIdx = (ky + 1) * 3 + (kx + 1)
                r += tempData[idx] * sharpenKernel[kernelIdx]
                g += tempData[idx + 1] * sharpenKernel[kernelIdx]
                b += tempData[idx + 2] * sharpenKernel[kernelIdx]
              }
            }
            const idx = (y * canvas.width + x) * 4
            data[idx] = Math.min(255, Math.max(0, r))
            data[idx + 1] = Math.min(255, Math.max(0, g))
            data[idx + 2] = Math.min(255, Math.max(0, b))
          }
        }

        // Put processed image data back
        ctx.putImageData(imageData, 0, 0)

        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert canvas to blob'))
          }
        }, mimeType || 'image/jpeg', 0.95)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = `data:${mimeType};base64,${base64Data}`
    })
  }

  /**
   * Get current model state
   */
  getState(): ModelState {
    return { ...this.modelState }
  }

  /**
   * Check if models are ready
   */
  isReady(): boolean {
    return this.modelState.isLoaded && !this.modelState.isLoading
  }

  /**
   * Reset model state (useful for error recovery)
   */
      reset(): void {
    this.modelState = {
      isLoaded: false,
      isLoading: false,
      loadProgress: 0,
      error: null,
      ocrPipeline: null,
      visionPipeline: null,
      textPipeline: null
    }
  }
}

// Export singleton instance
export const localLLMService = new LocalLLMService()
