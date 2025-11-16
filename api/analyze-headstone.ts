// API endpoint for analyzing headstone images using OpenAI Vision API
import { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Types matching the persons table schema
interface HeadstonePerson {
    // Core identification
    title?: string;
    forename?: string;
    middle_name?: string;
    surname?: string;
    full_name?: string;
    known_as?: string;
    maiden_name?: string;

    // Personal details
    gender?: string;
    date_of_birth?: string; // ISO date format
    date_of_death?: string; // ISO date format
    age_at_death?: number;
    time_of_death?: string; // HH:MM format

    // Location information
    birth_city?: string;
    birth_sub_country?: string;
    birth_country?: string;
    address_line1?: string;
    address_line2?: string;
    town?: string;
    county?: string;
    country?: string;
    postcode?: string;

    // Contact information (rarely found on headstones)
    mobile?: string;
    landline?: string;
    email_address?: string;

    // Personal characteristics
    marital_status?: string;
    race?: string;
    ethnicity?: string;

    // Status flags
    deceased: boolean; // Always true for headstones
    person_of_interest?: boolean;
    veteran?: boolean;

    // Death information
    cause_of_death?: string;

    // Additional notes from the headstone
    notes?: string;
}

interface HeadstoneAnalysisResponse {
    success: boolean;
    persons: HeadstonePerson[];
    full_text_transcription?: string;
    raw_analysis?: string;
    error?: string;
    metadata?: {
        analysis_timestamp: string;
        model_used: string;
        confidence_level: string;
    };
}

// Compress and resize image to reduce token usage and speed up processing
async function compressImage(base64Data: string, mimeType: string): Promise<string> {
    try {
        // Decode base64 to get actual image size
        const binaryString = Buffer.from(base64Data, 'base64');
        const imageSizeKB = binaryString.length / 1024;
        
        // If image is already small (< 100KB), return as-is
        // Client-side compression should handle most cases, so we can be more aggressive here
        if (imageSizeKB < 100) {
            return base64Data;
        }

        // For larger images, we'll resize them using canvas-like approach
        // Since we're in Node.js/Vercel, we can use sharp if available, or resize via canvas
        // For now, we'll implement a simple resize using sharp (if available) or return optimized base64
        
        // Try to use sharp for better compression (if available)
        let sharp: any;
        try {
            sharp = require('sharp');
        } catch {
            // Sharp not available, use basic optimization
            console.log(`Image size: ${imageSizeKB.toFixed(2)}KB - resizing recommended but sharp not available`);
            // Return as-is for now, but log recommendation
            return base64Data;
        }

        // Resize image to max 768px on longest side (faster processing, still good quality for text)
        // Client-side compression should have already done 1024px, so this is a safety net
        const MAX_DIMENSION = 768;
        const buffer = Buffer.from(base64Data, 'base64');
        
        const image = sharp(buffer);
        const metadata = await image.metadata();
        
        // Calculate new dimensions maintaining aspect ratio
        let width = metadata.width;
        let height = metadata.height;
        
        if (width && height) {
            if (width > height && width > MAX_DIMENSION) {
                height = Math.round((height / width) * MAX_DIMENSION);
                width = MAX_DIMENSION;
            } else if (height > MAX_DIMENSION) {
                width = Math.round((width / height) * MAX_DIMENSION);
                height = MAX_DIMENSION;
            }
        }

        // Resize and compress
        const resizedBuffer = await image
            .resize(width, height, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 85, mozjpeg: true }) // Convert to JPEG with good quality
            .toBuffer();

        const compressedBase64 = resizedBuffer.toString('base64');
        const compressedSizeKB = resizedBuffer.length / 1024;
        
        console.log(`Image compressed: ${imageSizeKB.toFixed(2)}KB -> ${compressedSizeKB.toFixed(2)}KB (${((1 - compressedSizeKB/imageSizeKB) * 100).toFixed(1)}% reduction)`);
        
        return compressedBase64;
    } catch (error) {
        console.warn('Image compression failed, using original:', error);
        return base64Data;
    }
}

// OpenAI Vision API integration with structured output
async function analyzeHeadstoneWithOpenAI(imageData: string, mimeType: string): Promise<{persons: HeadstonePerson[], full_text_transcription: string}> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
        apiKey: apiKey,
    });

    // Define the structured output schema using OpenAI's JSON Schema
    const structuredOutputSchema = {
        type: "object",
        properties: {
            full_text_transcription: {
                type: "string",
                description: "Complete transcription of all text visible on the headstone, preserving line breaks and formatting"
            },
            persons: {
                type: "array",
                description: "List of deceased persons found on the headstone",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Title" },
                        forename: { type: "string", description: "First name" },
                        middle_name: { type: "string", description: "Middle name" },
                        surname: { type: "string", description: "Last name" },
                        full_name: { type: "string", description: "Complete full name" },
                        known_as: { type: "string", description: "Known as" },
                        maiden_name: { type: "string", description: "Maiden name" },
                        gender: { type: "string", description: "Gender" },
                        date_of_birth: { type: "string", description: "Date of birth (YYYY-MM-DD)" },
                        date_of_death: { type: "string", description: "Date of death (YYYY-MM-DD)" },
                        age_at_death: { type: "integer", description: "Age at death. If not present, calculate from date_of_birth and date_of_death. Consider infant deaths as decimal. Do not round." },
                        time_of_death: { type: "string", description: "Time of death (HH:MM)" },
                        birth_city: { type: "string", description: "Birth city" },
                        birth_sub_country: { type: "string", description: "Birth province/state" },
                        birth_country: { type: "string", description: "Birth country" },
                        address_line1: { type: "string", description: "Address line 1" },
                        address_line2: { type: "string", description: "Address line 2" },
                        town: { type: "string", description: "Town/city" },
                        county: { type: "string", description: "County/state" },
                        country: { type: "string", description: "Country" },
                        postcode: { type: "string", description: "Postal code" },
                        mobile: { type: "string", description: "Mobile" },
                        landline: { type: "string", description: "Phone" },
                        email_address: { type: "string", description: "Email" },
                        marital_status: { type: "string", description: "Marital status" },
                        race: { type: "string", description: "Race" },
                        ethnicity: { type: "string", description: "Ethnicity" },
                        deceased: { type: "boolean", description: "Deceased (always true)" },
                        person_of_interest: { type: "boolean", description: "Person of interest" },
                        veteran: { type: "boolean", description: "Veteran status" },
                        cause_of_death: { type: "string", description: "Cause of death" },
                        notes: { type: "string", description: "Additional notes/epitaphs" }
                    },
                    required: [
                        "title", "forename", "middle_name", "surname", "full_name", "known_as", "maiden_name",
                        "gender", "date_of_birth", "date_of_death", "age_at_death", "time_of_death",
                        "birth_city", "birth_sub_country", "birth_country", "address_line1", "address_line2",
                        "town", "county", "country", "postcode", "mobile", "landline", "email_address",
                        "marital_status", "race", "ethnicity", "deceased", "person_of_interest", "veteran",
                        "cause_of_death", "notes"
                    ],
                    additionalProperties: false
                }
            }
        },
        required: ["persons", "full_text_transcription"],
        additionalProperties: false
    };

    // Create the analysis prompt (optimized for speed - shorter prompt = faster processing)
    const analysisPrompt = `Extract deceased person information from this headstone image.

Extract: names, dates, relationships. Use "" for missing data. Set deceased=true for all. Include epitaphs in notes.

Provide complete transcription of ALL text in full_text_transcription field, preserving line breaks.`;

    try {
        // Construct the base64 data URI
        const base64DataUri = `data:${mimeType};base64,${imageData}`;

        // Use OpenAI's structured output feature (much more reliable than string parsing)
        // Using gpt-4o-mini for faster responses (2-3x faster than gpt-4o, still very accurate)
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Faster and cheaper while maintaining good accuracy
            max_tokens: 1000, // Reduced from 1500 for faster response (usually enough for headstone data)
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: analysisPrompt,
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: base64DataUri,
                                detail: 'low' // Lower resolution saves significant tokens
                            }
                        }
                    ]
                }
            ],
            temperature: 0.1, // Low temperature for consistent results

            // This is the key improvement: structured output ensures valid JSON
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "headstone_analysis",
                    schema: structuredOutputSchema,
                    strict: true // Enforces exact schema compliance
                }
            }
        });

        const content = response.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No analysis returned from OpenAI API');
        }

        // Parse the guaranteed-valid JSON response
        const analysisData = JSON.parse(content);

        // Log token usage for optimization
        if (response.usage) {
            console.log(`OpenAI Token Usage: ${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion = ${response.usage.total_tokens} total`);
        }

        // Convert OpenAI response to our HeadstonePerson format, handling missing/empty values
        const persons: HeadstonePerson[] = analysisData.persons.map((person: any) => {
            // Helper function to safely get field value
            const getField = (field: any) => field !== undefined && field !== "" ? field : null;

            return {
                // Core identification
                title: getField(person.title),
                forename: getField(person.forename),
                middle_name: getField(person.middle_name),
                surname: getField(person.surname),
                full_name: getField(person.full_name),
                known_as: getField(person.known_as),
                maiden_name: getField(person.maiden_name),

                // Personal details
                gender: getField(person.gender),
                date_of_birth: getField(person.date_of_birth),
                date_of_death: getField(person.date_of_death),
                age_at_death: person.age_at_death !== undefined && person.age_at_death !== "" ? person.age_at_death : null,
                time_of_death: getField(person.time_of_death),

                // Location information
                birth_city: getField(person.birth_city),
                birth_sub_country: getField(person.birth_sub_country),
                birth_country: getField(person.birth_country),
                address_line1: getField(person.address_line1),
                address_line2: getField(person.address_line2),
                town: getField(person.town),
                county: getField(person.county),
                country: getField(person.country),
                postcode: getField(person.postcode),

                // Contact information
                mobile: getField(person.mobile),
                landline: getField(person.landline),
                email_address: getField(person.email_address),

                // Personal characteristics
                marital_status: getField(person.marital_status),
                race: getField(person.race),
                ethnicity: getField(person.ethnicity),

                // Status flags
                deceased: true, // Always true for headstone analysis
                person_of_interest: person.person_of_interest === true || person.person_of_interest === "true",
                veteran: person.veteran === true || person.veteran === "true" || null,

                // Death information
                cause_of_death: getField(person.cause_of_death),

                // Additional notes
                notes: getField(person.notes)
            };
        });

        return {
            persons: persons,
            full_text_transcription: analysisData.full_text_transcription || ""
        };

    } catch (error) {
        console.error('Error analyzing headstone with OpenAI:', error);
        throw error;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed',
            message: 'Only POST requests are supported'
        });
    }

    try {
        // Parse the request body
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { imageData, mimeType } = body;

        // Validate required fields
        if (!imageData) {
            return res.status(400).json({
                error: 'Missing imageData',
                message: 'imageData is required in the request body'
            });
        }

        if (!mimeType) {
            return res.status(400).json({
                error: 'Missing mimeType',
                message: 'mimeType is required (e.g., image/jpeg, image/png)'
            });
        }

        // Validate supported image formats
        const supportedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!supportedMimeTypes.includes(mimeType.toLowerCase())) {
            return res.status(400).json({
                error: 'Unsupported image format',
                message: `Supported formats: ${supportedMimeTypes.join(', ')}`
            });
        }

        // Validate base64 data
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!base64Regex.test(imageData)) {
            return res.status(400).json({
                error: 'Invalid base64 data',
                message: 'imageData must be valid base64 encoded image data'
            });
        }

        console.log('Analyzing headstone image...');
        console.log('MIME type:', mimeType);
        console.log('Image data length:', imageData.length);

        // Compress image to reduce token usage
        const compressedImageData = await compressImage(imageData, mimeType);

        // Analyze the image with OpenAI
        const analysisResult = await analyzeHeadstoneWithOpenAI(compressedImageData, mimeType);

        const response: HeadstoneAnalysisResponse = {
            success: true,
            persons: analysisResult.persons,
            full_text_transcription: analysisResult.full_text_transcription,
            metadata: {
                analysis_timestamp: new Date().toISOString(),
                model_used: 'gpt-4o-mini',
                confidence_level: 'high'
            }
        };

        console.log(`Analysis complete: Found ${analysisResult.persons.length} person(s)`);
        console.log(`Full text transcription length: ${analysisResult.full_text_transcription.length} characters`);

        return res.status(200).json(response);

    } catch (error) {
        console.error('Headstone analysis API error:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Handle specific error cases
        if (errorMessage.includes('OPENAI_API_KEY')) {
            return res.status(500).json({
                error: 'Configuration Error',
                message: 'OpenAI API key is not configured. Please add OPENAI_API_KEY to your environment variables.',
                success: false
            });
        }

        if (errorMessage.includes('OpenAI API error')) {
            return res.status(502).json({
                error: 'OpenAI Service Error',
                message: 'Failed to analyze image with OpenAI API. Please try again.',
                success: false,
                details: errorMessage
            });
        }

        return res.status(500).json({
            error: 'Analysis Failed',
            message: 'Failed to analyze headstone image',
            success: false,
            details: errorMessage
        });
    }
}