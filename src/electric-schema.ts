// Electric SQL Type Definitions
// Electric SQL doesn't use a schema definition file like PowerSync.
// Instead, shapes are defined at query time. This file provides TypeScript types
// and helper functions for type safety and consistency.

// Type definitions matching Postgres tables
export type PlotRecord = {
  id: string
  geometry: string
  section: string
  row: string
  number: string
  status: string
  location_id: string
  temp_plot_id: string | null
  date_created: string
  date_modified: string
  created_by: string
  modified_by: string
  notes: string | null
}

export type SettingRecord = {
  id: string
  key: string
  value: string
  type: string
  date_modified: string
  modified_by: string
}

export type PlotImageRecord = {
  id: string
  plot_id: string
  file_name: string
  data: string
  thumbnail_data: string
  cloud_url: string | null
  original_size: string
  thumbnail_size: string
  dimensions: string
  format: string
  date_created: string
  created_by: string
}

export type PersonRecord = {
  id: string
  plot_id: string
  title: string | null
  forename: string | null
  middle_name: string | null
  surname: string | null
  full_name: string | null
  address_line1: string | null
  address_line2: string | null
  town: string | null
  county: string | null
  country: string | null
  postcode: string | null
  mobile: string | null
  landline: string | null
  email_address: string | null
  gender: string | null
  date_of_birth: string | null
  deceased: string | null
  notes: string | null
  race: string | null
  ethnicity: string | null
  created_by: string | null
  date_created: string | null
  last_updated_by: string | null
  last_updated_datetime: string | null
  birth_city: string | null
  birth_sub_country: string | null
  birth_country: string | null
  marital_status: string | null
  known_as: string | null
  maiden_name: string | null
  date_of_death: string | null
  age_at_death: string | null
  cause_of_death: string | null
  person_of_interest: string | null
  veteran: string | null
  time_of_death: string | null
}

export type PersonImageRecord = {
  id: string
  person_id: string
  file_name: string
  data: string
  thumbnail_data: string
  cloud_url: string | null
  original_size: string
  thumbnail_size: string
  dimensions: string
  format: string
  date_created: string
  created_by: string
}

export type LocationRecord = {
  id: string
  name: string
  bbox: string
  min_zoom: string
  max_zoom: string
  pmtiles_url: string | null
  date_created: string
  date_modified: string
  created_by: string
  is_public: string
}

// Legacy type exports for compatibility
export type Plot = PlotRecord
export type Setting = SettingRecord
export type PlotImage = PlotImageRecord
export type Person = PersonRecord
export type PersonImage = PersonImageRecord
export type Location = LocationRecord

// Helper functions to create shape parameters for common queries
export const createPlotsShape = (locationId: string) => ({
  table: 'plots',
  where: 'location_id = $1',
  params: { '1': locationId }
})

export const createPlotShape = (plotId: string) => ({
  table: 'plots',
  where: 'id = $1',
  params: { '1': plotId }
})

export const createPlotImagesShape = (plotId: string) => ({
  table: 'plot_images',
  where: 'plot_id = $1',
  params: { '1': plotId }
})

export const createPersonImagesShape = (personId: string) => ({
  table: 'person_images',
  where: 'person_id = $1',
  params: { '1': personId }
})

export const createLocationsShape = () => ({
  table: 'locations',
  where: undefined,
  params: undefined
})

// Utility function to convert base64 to blob (kept from original schema)
export const base64ToBlob = (base64: string, mimeType: string) => {
  // Handle data URLs (data:image/jpeg;base64,<data>) by extracting just the base64 part
  let base64Data = base64
  if (base64.includes(',')) {
    base64Data = base64.split(',')[1]
  }
  
  try {
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: mimeType })
  } catch (error) {
    console.error('Error decoding base64 data:', error)
    console.error('Base64 string (first 100 chars):', base64Data.substring(0, 100))
    throw new Error(`Failed to decode base64 data: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

