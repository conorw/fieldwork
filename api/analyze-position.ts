// API endpoint for analyzing relative positions of graves from photo pairs
import { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

interface PositionAnalysisRequest {
  images: Array<{
    data: string; // base64
    mimeType: string;
  }>;
}

interface PositionAnalysisResponse {
  relativeDirection: "left" | "right" | "front" | "behind" | "same";
  estimatedDistance: number; // meters
  alignedInRow: boolean;
  confidence: number; // 0-1
  visualMarkers?: string[];
  reasoning?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { images }: PositionAnalysisRequest = req.body;

    if (!images || images.length !== 2) {
      return res.status(400).json({
        error: "Exactly 2 images are required for position analysis",
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY environment variable is not set",
      });
    }

    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // Create analysis prompt
    const prompt = `Analyze these two consecutive grave photos from a cemetery survey.

Photo 1: First grave photo
Photo 2: Second grave photo

Questions:
1. Is Photo 2's grave to the LEFT, RIGHT, DIRECTLY IN FRONT, BEHIND, or SAME POSITION as Photo 1's grave?
2. Estimate the distance between graves in meters (typical range 1-3m for graves in a row)
3. Are the graves aligned in a row? (Yes/No)
4. Any visual markers (trees, paths, other graves) that help determine relative position?

Respond in JSON format with:
- relativeDirection: "left" | "right" | "front" | "behind" | "same"
- estimatedDistance: number (meters)
- alignedInRow: boolean
- confidence: number (0-1, how confident you are in the analysis)
- visualMarkers: string[] (optional, any visual markers noted)
- reasoning: string (optional, brief explanation)`;

    // Define structured output schema
    const structuredOutputSchema = {
      type: "object",
      properties: {
        relativeDirection: {
          type: "string",
          enum: ["left", "right", "front", "behind", "same"],
          description: "Direction of Photo 2 relative to Photo 1",
        },
        estimatedDistance: {
          type: "number",
          description: "Estimated distance between graves in meters",
        },
        alignedInRow: {
          type: "boolean",
          description: "Whether the graves are aligned in a row",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence level in the analysis (0-1)",
        },
        visualMarkers: {
          type: "array",
          items: { type: "string" },
          description: "Visual markers that help determine position",
        },
        reasoning: {
          type: "string",
          description: "Brief explanation of the analysis",
        },
      },
      required: ["relativeDirection", "estimatedDistance", "alignedInRow", "confidence"],
      additionalProperties: false,
    };

    // Prepare images for OpenAI
    const imageContents = images.map((img) => ({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.data}`,
        detail: "low", // Lower resolution for faster processing
      },
    }));

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            ...imageContents,
          ],
        },
      ],
      temperature: 0.1, // Low temperature for consistent results
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "position_analysis",
          schema: structuredOutputSchema,
          strict: true,
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No analysis returned from OpenAI API");
    }

    const analysisData: PositionAnalysisResponse = JSON.parse(content);

    return res.status(200).json(analysisData);
  } catch (error) {
    console.error("Error analyzing position:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to analyze position",
    });
  }
}

