import OpenAI from "openai";
import { normalizeDateToIso } from "../../src/utils/inscriptionDates";

export interface HeadstonePerson {
  title?: string;
  forename?: string;
  middle_name?: string;
  surname?: string;
  full_name?: string;
  known_as?: string;
  maiden_name?: string;
  gender?: string;
  date_of_birth?: string | null;
  date_of_death?: string | null;
  age_at_death?: number | null;
  time_of_death?: string;
  birth_city?: string;
  birth_sub_country?: string;
  birth_country?: string;
  address_line1?: string;
  address_line2?: string;
  town?: string;
  county?: string;
  country?: string;
  postcode?: string;
  mobile?: string;
  landline?: string;
  email_address?: string;
  marital_status?: string;
  race?: string;
  ethnicity?: string;
  deceased: boolean;
  person_of_interest?: boolean;
  veteran?: boolean | null;
  cause_of_death?: string;
  notes?: string;
  relationships?: string[];
  occupation?: string;
}

const structuredOutputSchema = {
  type: "object",
  properties: {
    full_text_transcription: {
      type: "string",
      description:
        "Complete transcription of all text visible on the headstone, preserving line breaks and formatting",
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
          date_of_birth: {
            type: "string",
            description: "Date of birth (YYYY-MM-DD)",
          },
          date_of_death: {
            type: "string",
            description: "Date of death (YYYY-MM-DD)",
          },
          age_at_death: {
            type: "integer",
            description:
              "Age at death. If not present, calculate from date_of_birth and date_of_death.",
          },
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
          notes: { type: "string", description: "Per-person notes" },
          relationships: {
            type: "array",
            description: "Relationship phrases for this person",
            items: { type: "string" },
          },
          occupation: { type: "string", description: "Trade or profession" },
        },
        required: [
          "title",
          "forename",
          "middle_name",
          "surname",
          "full_name",
          "known_as",
          "maiden_name",
          "gender",
          "date_of_birth",
          "date_of_death",
          "age_at_death",
          "time_of_death",
          "birth_city",
          "birth_sub_country",
          "birth_country",
          "address_line1",
          "address_line2",
          "town",
          "county",
          "country",
          "postcode",
          "mobile",
          "landline",
          "email_address",
          "marital_status",
          "race",
          "ethnicity",
          "deceased",
          "person_of_interest",
          "veteran",
          "cause_of_death",
          "notes",
          "relationships",
          "occupation",
        ],
        additionalProperties: false,
      },
    },
    shared_epitaph: {
      type: "string",
      description: "Shared memorial lines not tied to one person",
    },
    physical: {
      type: "object",
      properties: {
        material: {
          type: "string",
          enum: [
            "granite",
            "marble",
            "slate",
            "limestone",
            "sandstone",
            "bronze",
            "wood",
            "concrete",
            "other",
            "unknown",
          ],
        },
        form: {
          type: "string",
          enum: [
            "upright",
            "arched",
            "desk",
            "kerb",
            "ledger",
            "cross",
            "plaque",
            "cremation",
            "obelisk",
            "other",
            "unknown",
          ],
        },
        condition: {
          type: "string",
          enum: [
            "excellent",
            "good",
            "fair",
            "weathered",
            "damaged",
            "leaning",
            "fallen",
            "illegible",
            "new",
            "unknown",
          ],
        },
        detail: { type: "string" },
      },
      required: ["material", "form", "condition", "detail"],
      additionalProperties: false,
    },
  },
  required: ["persons", "full_text_transcription", "shared_epitaph", "physical"],
  additionalProperties: false,
} as const;

export async function analyzeHeadstoneWithOpenAI(
  imageData: string,
  mimeType: string,
): Promise<{
  persons: HeadstonePerson[];
  full_text_transcription: string;
  shared_epitaph: string;
  physical: {
    material: string;
    form: string;
    condition: string;
    detail: string;
  };
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const openai = new OpenAI({ apiKey });
  const analysisPrompt = `Extract deceased person information AND physical monument attributes from this headstone image.

Extract: names, dates, per-person relationships (e.g. dear husband, wife and mother), occupations/regiments, shared memorial lines into shared_epitaph, and physical {material, form, condition, detail}.
Use "" for missing strings and [] for missing arrays. Set deceased=true for all.
Provide complete transcription of ALL text in full_text_transcription, preserving line breaks.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1400,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: analysisPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageData}`,
              detail: "low",
            },
          },
        ],
      },
    ],
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "headstone_analysis",
        schema: structuredOutputSchema,
        strict: true,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No analysis returned from OpenAI API");
  }
  const analysisData = JSON.parse(content);
  const getField = (field: unknown) =>
    field !== undefined && field !== "" ? field : null;

  const persons: HeadstonePerson[] = (analysisData.persons || []).map(
    (person: Record<string, unknown>): HeadstonePerson => ({
      title: getField(person.title) as string | undefined,
      forename: getField(person.forename) as string | undefined,
      middle_name: getField(person.middle_name) as string | undefined,
      surname: getField(person.surname) as string | undefined,
      full_name: getField(person.full_name) as string | undefined,
      known_as: getField(person.known_as) as string | undefined,
      maiden_name: getField(person.maiden_name) as string | undefined,
      gender: getField(person.gender) as string | undefined,
      date_of_birth: normalizeDateToIso(person.date_of_birth as string) || null,
      date_of_death: normalizeDateToIso(person.date_of_death as string) || null,
      age_at_death:
        person.age_at_death !== undefined && person.age_at_death !== ""
          ? (person.age_at_death as number)
          : null,
      time_of_death: getField(person.time_of_death) as string | undefined,
      birth_city: getField(person.birth_city) as string | undefined,
      birth_sub_country: getField(person.birth_sub_country) as string | undefined,
      birth_country: getField(person.birth_country) as string | undefined,
      address_line1: getField(person.address_line1) as string | undefined,
      address_line2: getField(person.address_line2) as string | undefined,
      town: getField(person.town) as string | undefined,
      county: getField(person.county) as string | undefined,
      country: getField(person.country) as string | undefined,
      postcode: getField(person.postcode) as string | undefined,
      mobile: getField(person.mobile) as string | undefined,
      landline: getField(person.landline) as string | undefined,
      email_address: getField(person.email_address) as string | undefined,
      marital_status: getField(person.marital_status) as string | undefined,
      race: getField(person.race) as string | undefined,
      ethnicity: getField(person.ethnicity) as string | undefined,
      deceased: true,
      person_of_interest:
        person.person_of_interest === true ||
        person.person_of_interest === "true",
      veteran:
        person.veteran === true || person.veteran === "true" ? true : null,
      cause_of_death: getField(person.cause_of_death) as string | undefined,
      notes: getField(person.notes) as string | undefined,
      relationships: Array.isArray(person.relationships)
        ? person.relationships.filter(
            (r: unknown): r is string =>
              typeof r === "string" && r.trim().length > 0,
          )
        : [],
      occupation: (getField(person.occupation) as string) || undefined,
    }),
  );

  return {
    persons,
    full_text_transcription: analysisData.full_text_transcription || "",
    shared_epitaph: analysisData.shared_epitaph || "",
    physical: {
      material: analysisData.physical?.material || "unknown",
      form: analysisData.physical?.form || "unknown",
      condition: analysisData.physical?.condition || "unknown",
      detail: analysisData.physical?.detail || "",
    },
  };
}
