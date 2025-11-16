// PowerSync Schema Configuration
import { column, Schema, Table } from '@powersync/web';

// Define tables using PowerSync's schema format
// Note: PowerSync automatically adds 'id' columns, don't define them manually
const plots = new Table({
  geometry: column.text,
  section: column.text,
  row: column.text,
  number: column.text,
  status: column.text,
  location_id: column.text, // Foreign key to locations table
  temp_plot_id: column.text, // Temporary ID for headstone analysis association
  date_created: column.text,
  date_modified: column.text,
  created_by: column.text,
  modified_by: column.text,
  notes: column.text
  // photos column removed - use plot_images table instead
}, { indexes: { idx_plots_location_date: ['location_id', 'date_created'] } });

const settings = new Table({
  key: column.text,
  value: column.text,
  type: column.text,
  date_modified: column.text,
  modified_by: column.text
}, {
  localOnly: true
});

const plot_images = new Table({
  plot_id: column.text,
  file_name: column.text,
  data: column.text, // Keep for backward compatibility during migration
  thumbnail_data: column.text, // 200x200px thumbnail, base64
  cloud_url: column.text, // Full resolution URL from Vercel storage
  original_size: column.text, // Original file size in bytes
  thumbnail_size: column.text, // Thumbnail size in bytes
  dimensions: column.text, // JSON: {"width": 4000, "height": 3000}
  format: column.text, // MIME type (image/jpeg, etc.)
  date_created: column.text,
  created_by: column.text
}, { indexes: { idx_plot_images_plot_id: ['plot_id'] } });

const persons = new Table({
  plot_id: column.text, // Foreign key to plots table
  title: column.text,
  forename: column.text,
  middle_name: column.text,
  surname: column.text,
  full_name: column.text,
  address_line1: column.text,
  address_line2: column.text,
  town: column.text,
  county: column.text,
  country: column.text,
  postcode: column.text,
  mobile: column.text,
  landline: column.text,
  email_address: column.text,
  gender: column.text,
  date_of_birth: column.text,
  deceased: column.text, // Boolean as text
  notes: column.text,
  race: column.text,
  ethnicity: column.text,
  created_by: column.text,
  date_created: column.text,
  last_updated_by: column.text,
  last_updated_datetime: column.text,
  birth_city: column.text,
  birth_sub_country: column.text,
  birth_country: column.text,
  marital_status: column.text,
  known_as: column.text,
  maiden_name: column.text,
  date_of_death: column.text,
  age_at_death: column.text,
  cause_of_death: column.text,
  person_of_interest: column.text, // Boolean as text
  veteran: column.text, // Boolean as text
  time_of_death: column.text
}, { indexes: { idx_persons_plot_id: ['plot_id'] } });

const person_images = new Table({
  person_id: column.text, // Foreign key to persons table
  file_name: column.text,
  data: column.text, // Keep for backward compatibility during migration
  thumbnail_data: column.text, // 200x200px thumbnail, base64
  cloud_url: column.text, // Full resolution URL from Vercel storage
  original_size: column.text, // Original file size in bytes
  thumbnail_size: column.text, // Thumbnail size in bytes
  dimensions: column.text, // JSON: {"width": 4000, "height": 3000}
  format: column.text, // MIME type (image/jpeg, etc.)
  date_created: column.text,
  created_by: column.text
}, { indexes: { idx_person_images_person_id: ['person_id'] } });

const locations = new Table({
  name: column.text,
  bbox: column.text,
  min_zoom: column.text,
  max_zoom: column.text,
  pmtiles_url: column.text, // URL to PMTiles file
  date_created: column.text,
  date_modified: column.text, // Add missing date_modified field
  created_by: column.text,
  is_public: column.text
}, { indexes: { idx_locations_name: ['name'] } });

console.log('PowerSync Schema: Creating AppSchema with tables:', { plots, settings, plot_images, persons, person_images, locations });

export const AppSchema = new Schema({
  plots: plots,
  settings: settings,
  plot_images: plot_images,
  persons: persons,
  person_images: person_images,
  locations: locations
});

console.log('PowerSync Schema: AppSchema created:', AppSchema);
console.log('PowerSync Schema: AppSchema types:', AppSchema.types);
console.log('PowerSync Schema: AppSchema props:', AppSchema.props);

// TypeScript types for PowerSync
export type Database = (typeof AppSchema)['types'];
export type PlotRecord = Database['plots'];
export type SettingRecord = Database['settings'];
export type PlotImageRecord = Database['plot_images'];
export type PersonRecord = Database['persons'];
export type PersonImageRecord = Database['person_images'];
export type LocationRecord = Database['locations'];

// Legacy type exports for compatibility
export type Plot = PlotRecord;
export type Setting = SettingRecord;
export type PlotImage = PlotImageRecord;
export type Location = LocationRecord;

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