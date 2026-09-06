// PowerSync Schema Configuration
import { column, Schema, Table } from "@powersync/web";

// Define tables using PowerSync's schema format
// Note: PowerSync automatically adds 'id' columns, don't define them manually
const plots = new Table(
  {
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
    notes: column.text,
    // photos column removed - use plot_images table instead
  },
  { indexes: { idx_plots_location_date: ["location_id", "date_created"] } },
);

const settings = new Table(
  {
    key: column.text,
    value: column.text,
    type: column.text,
    date_modified: column.text,
    modified_by: column.text,
  },
  {
    localOnly: true,
  },
);

const plot_images = new Table(
  {
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
    created_by: column.text,
  },
  { indexes: { idx_plot_images_plot_id: ["plot_id"] } },
);

const persons = new Table(
  {
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
    time_of_death: column.text,
  },
  { indexes: { idx_persons_plot_id: ["plot_id"] } },
);

const person_images = new Table(
  {
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
    created_by: column.text,
  },
  { indexes: { idx_person_images_person_id: ["person_id"] } },
);

const locations = new Table(
  {
    name: column.text,
    bbox: column.text,
    min_zoom: column.text,
    max_zoom: column.text,
    pmtiles_url: column.text, // URL to PMTiles file
    date_created: column.text,
    date_modified: column.text,
    created_by: column.text,
    is_public: column.text,
    owner_id: column.text, // FK to auth.users
    // Per-cemetery local VLM adapter (GPT teacher → HF Jobs → local)
    ai_status: column.text, // teacher | training | local | error
    adapter_url: column.text,
    adapter_version: column.text,
    ai_train_error: column.text,
    ai_train_job_id: column.text,
  },
  { indexes: { idx_locations_name: ["name"] } },
);

const headstone_training_examples = new Table(
  {
    location_id: column.text,
    plot_id: column.text,
    plot_image_id: column.text,
    image_url: column.text,
    stone_type: column.text,
    target_json: column.text, // reasoning JSON string
    reviewed_by: column.text,
    reviewed_at: column.text,
    date_created: column.text,
  },
  {
    indexes: {
      idx_training_examples_location_id: ["location_id"],
      idx_training_examples_stone_type: ["stone_type"],
    },
  },
);

const location_members = new Table(
  {
    id: column.text, // Composite key: location_id + user_id
    location_id: column.text,
    user_id: column.text,
    user_email: column.text, // Email of the member (for display without querying auth.users)
    role: column.text, // 'owner', 'admin', 'member'
    joined_at: column.text,
  },
  {
    indexes: {
      idx_location_members_location_id: ["location_id"],
      idx_location_members_user_id: ["user_id"],
      idx_location_members_user_email: ["user_email"],
    },
  },
);

const location_invites = new Table(
  {
    location_id: column.text,
    invited_by: column.text,
    email: column.text,
    role: column.text, // 'admin', 'member'
    token: column.text,
    status: column.text, // 'pending', 'accepted', 'expired', 'cancelled'
    expires_at: column.text,
    created_at: column.text,
  },
  {
    indexes: {
      idx_location_invites_location_id: ["location_id"],
      idx_location_invites_email: ["email"],
      idx_location_invites_token: ["token"],
    },
  },
);

const location_requests = new Table(
  {
    location_id: column.text,
    user_id: column.text,
    user_email: column.text, // Email of the requesting user
    status: column.text, // 'pending', 'approved', 'rejected', 'cancelled'
    message: column.text,
    created_at: column.text,
    responded_at: column.text,
    responded_by: column.text,
  },
  {
    indexes: {
      idx_location_requests_location_id: ["location_id"],
      idx_location_requests_user_id: ["user_id"],
    },
  },
);

export const AppSchema = new Schema({
  plots: plots,
  settings: settings,
  plot_images: plot_images,
  persons: persons,
  person_images: person_images,
  locations: locations,
  location_members: location_members,
  location_invites: location_invites,
  location_requests: location_requests,
  headstone_training_examples: headstone_training_examples,
});

// TypeScript types for PowerSync
export type Database = (typeof AppSchema)["types"];
export type PlotRecord = Database["plots"];
export type SettingRecord = Database["settings"];
export type PlotImageRecord = Database["plot_images"];
export type PersonRecord = Database["persons"];
export type PersonImageRecord = Database["person_images"];
export type LocationRecord = Database["locations"];
export type LocationMemberRecord = Database["location_members"];
export type LocationInviteRecord = Database["location_invites"];
export type LocationRequestRecord = Database["location_requests"];
export type HeadstoneTrainingExampleRecord =
  Database["headstone_training_examples"];

// Legacy type exports for compatibility
export type Plot = PlotRecord;
export type Setting = SettingRecord;
export type PlotImage = PlotImageRecord;
export type Location = LocationRecord;

export type LocationAiStatus = "teacher" | "training" | "local" | "error";

// Utility function to convert base64 to blob (kept from original schema)
export const base64ToBlob = (base64: string, mimeType: string) => {
  // Handle data URLs (data:image/jpeg;base64,<data>) by extracting just the base64 part
  let base64Data = base64;
  if (base64.includes(",")) {
    base64Data = base64.split(",")[1];
  }

  try {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  } catch (error) {
    console.error("Error decoding base64 data:", error);
    console.error(
      "Base64 string (first 100 chars):",
      base64Data.substring(0, 100),
    );
    throw new Error(
      `Failed to decode base64 data: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};
