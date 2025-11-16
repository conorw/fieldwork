-- Initial database schema migration for Fieldwork application
-- This migration creates the complete database schema in its current state
-- Consolidates all previous migrations (001-010) into a single initial migration

-- ============================================================================
-- PLOTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS plots (
    id VARCHAR(255) PRIMARY KEY,
    geometry TEXT NOT NULL, -- GeoJSON string representing the plot boundary
    section VARCHAR(255) NOT NULL,
    row VARCHAR(255) NOT NULL,
    number VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    location_id VARCHAR(255), -- Foreign key to locations table
    temp_plot_id VARCHAR(255), -- Temporary ID for headstone analysis association
    date_created VARCHAR(255) NOT NULL,
    date_modified VARCHAR(255) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    modified_by VARCHAR(255) NOT NULL,
    notes TEXT,
    -- photos column removed - use plot_images table instead
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- ============================================================================
-- SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR(255) PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    type VARCHAR(255) NOT NULL,
    date_modified VARCHAR(255) NOT NULL,
    modified_by VARCHAR(255) NOT NULL
);

-- ============================================================================
-- PLOT_IMAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS plot_images (
    id VARCHAR(255) PRIMARY KEY,
    plot_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    data TEXT, -- Legacy full-size base64 data for backward compatibility
    thumbnail_data TEXT, -- 200x200px thumbnail, base64 encoded
    cloud_url TEXT, -- Full resolution URL from Vercel storage
    original_size VARCHAR(255), -- Original file size in bytes
    thumbnail_size VARCHAR(255), -- Thumbnail size in bytes
    dimensions TEXT, -- JSON string: {"width": 4000, "height": 3000}
    format VARCHAR(255), -- MIME type (image/jpeg, image/png, etc.)
    date_created VARCHAR(255) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE
);

-- ============================================================================
-- LOCATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS locations (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bbox TEXT NOT NULL, -- JSON string of [minLon, minLat, maxLon, maxLat]
    min_zoom VARCHAR(255) NOT NULL,
    max_zoom VARCHAR(255) NOT NULL,
    pmtiles_url TEXT NOT NULL, -- URL to PMTiles file
    date_created VARCHAR(255) NOT NULL,
    date_modified VARCHAR(255) NOT NULL, -- Timestamp when location was last modified
    created_by VARCHAR(255) NOT NULL,
    is_public VARCHAR(255) NOT NULL -- 'true' or 'false' string
);

-- ============================================================================
-- PERSONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS persons (
    id VARCHAR(255) PRIMARY KEY,
    plot_id VARCHAR(255) NOT NULL,
    title VARCHAR(20) NOT NULL DEFAULT '',
    forename VARCHAR(100) NOT NULL DEFAULT '',
    middle_name VARCHAR(100) NOT NULL DEFAULT '',
    surname VARCHAR(100) NOT NULL DEFAULT '',
    full_name VARCHAR(350) NOT NULL DEFAULT '',
    known_as VARCHAR(50) NOT NULL DEFAULT '',
    maiden_name VARCHAR(50) NOT NULL DEFAULT '',
    address_line1 VARCHAR(100) NOT NULL DEFAULT '',
    address_line2 VARCHAR(100) NOT NULL DEFAULT '',
    town VARCHAR(100) NOT NULL DEFAULT '',
    county VARCHAR(100) NOT NULL DEFAULT '',
    country VARCHAR(100) NOT NULL DEFAULT '',
    postcode VARCHAR(12) NOT NULL DEFAULT '',
    mobile VARCHAR(50) NOT NULL DEFAULT '',
    landline VARCHAR(50) NOT NULL DEFAULT '',
    email_address VARCHAR(100) NOT NULL DEFAULT '',
    gender VARCHAR(100) NOT NULL DEFAULT '',
    date_of_birth DATE,
    date_of_death DATE,
    age_at_death INTEGER,
    time_of_death TIME,
    deceased BOOLEAN NOT NULL DEFAULT FALSE,
    person_of_interest BOOLEAN NOT NULL DEFAULT FALSE,
    veteran BOOLEAN NOT NULL DEFAULT FALSE,
    birth_city VARCHAR(200) NOT NULL DEFAULT '',
    birth_sub_country VARCHAR(100) NOT NULL DEFAULT '',
    birth_country VARCHAR(100) NOT NULL DEFAULT '',
    marital_status VARCHAR(100) NOT NULL DEFAULT '',
    race VARCHAR(100) NOT NULL DEFAULT '',
    ethnicity VARCHAR(100) NOT NULL DEFAULT '',
    cause_of_death VARCHAR(150) NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by VARCHAR(255),
    date_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_by VARCHAR(255),
    last_updated_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_persons_plot_id FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE CASCADE
);

-- ============================================================================
-- PERSON_IMAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS person_images (
    id VARCHAR(255) PRIMARY KEY,
    person_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    data TEXT, -- Legacy full-size base64 data for backward compatibility
    thumbnail_data TEXT, -- 200x200px thumbnail, base64 encoded
    cloud_url TEXT, -- Full resolution URL from Vercel storage
    original_size VARCHAR(50) NOT NULL DEFAULT '0',
    thumbnail_size VARCHAR(50) NOT NULL DEFAULT '0',
    dimensions TEXT, -- JSON string: {"width": 4000, "height": 3000}
    format VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    date_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL DEFAULT 'anonymous',
    CONSTRAINT fk_person_images_person_id FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Plots indexes
CREATE INDEX IF NOT EXISTS idx_plots_section_row ON plots(section, row);
CREATE INDEX IF NOT EXISTS idx_plots_status ON plots(status);
CREATE INDEX IF NOT EXISTS idx_plots_date_created ON plots(date_created);
CREATE INDEX IF NOT EXISTS idx_plots_location_id ON plots(location_id);
CREATE INDEX IF NOT EXISTS idx_plots_temp_plot_id ON plots(temp_plot_id);
CREATE INDEX IF NOT EXISTS idx_plots_location_date ON plots(location_id, date_created DESC);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Plot images indexes
CREATE INDEX IF NOT EXISTS idx_plot_images_plot_id ON plot_images(plot_id);
CREATE INDEX IF NOT EXISTS idx_plot_images_date_created ON plot_images(date_created);
CREATE INDEX IF NOT EXISTS idx_plot_images_cloud_url ON plot_images(cloud_url);

-- Locations indexes
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
CREATE INDEX IF NOT EXISTS idx_locations_created_by ON locations(created_by);
CREATE INDEX IF NOT EXISTS idx_locations_is_public ON locations(is_public);

-- Persons indexes
CREATE INDEX IF NOT EXISTS idx_persons_plot_id ON persons(plot_id);
CREATE INDEX IF NOT EXISTS idx_persons_surname ON persons(surname);
CREATE INDEX IF NOT EXISTS idx_persons_full_name ON persons(full_name);
CREATE INDEX IF NOT EXISTS idx_persons_date_of_death ON persons(date_of_death);
CREATE INDEX IF NOT EXISTS idx_persons_deceased ON persons(deceased);

-- Person images indexes
CREATE INDEX IF NOT EXISTS idx_person_images_person_id ON person_images(person_id);
CREATE INDEX IF NOT EXISTS idx_person_images_date_created ON person_images(date_created);
CREATE INDEX IF NOT EXISTS idx_person_images_format ON person_images(format);

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================
COMMENT ON TABLE plots IS 'Stores field plot information including geometry and metadata';
COMMENT ON TABLE settings IS 'Application configuration settings (local-only)';
COMMENT ON TABLE plot_images IS 'Stores image data associated with plots using hybrid storage (thumbnails locally, full resolution in cloud)';
COMMENT ON TABLE locations IS 'Stores saved map locations with extent and PMTiles URLs';
COMMENT ON TABLE persons IS 'Stores information about deceased individuals linked to burial plots';
COMMENT ON TABLE person_images IS 'Stores images associated with persons using hybrid storage (thumbnails locally, full resolution in cloud)';

-- ============================================================================
-- COLUMN COMMENTS
-- ============================================================================

-- Plots columns
COMMENT ON COLUMN plots.geometry IS 'GeoJSON string representing the plot boundary';
COMMENT ON COLUMN plots.location_id IS 'Foreign key reference to the location this plot belongs to';
COMMENT ON COLUMN plots.temp_plot_id IS 'Temporary ID used to associate headstone analysis results with plots during creation process';

-- Plot images columns
COMMENT ON COLUMN plot_images.data IS 'Legacy full-size base64 data for backward compatibility during migration';
COMMENT ON COLUMN plot_images.thumbnail_data IS '200x200px thumbnail image stored as base64';
COMMENT ON COLUMN plot_images.cloud_url IS 'URL to full resolution image in cloud storage (Vercel Blob)';
COMMENT ON COLUMN plot_images.original_size IS 'Original file size in bytes';
COMMENT ON COLUMN plot_images.thumbnail_size IS 'Thumbnail size in bytes';
COMMENT ON COLUMN plot_images.dimensions IS 'JSON string with width and height: {"width": 4000, "height": 3000}';
COMMENT ON COLUMN plot_images.format IS 'MIME type of the image (image/jpeg, image/png, etc.)';

-- Locations columns
COMMENT ON COLUMN locations.bbox IS 'JSON string of [minLon, minLat, maxLon, maxLat] coordinates';
COMMENT ON COLUMN locations.pmtiles_url IS 'URL to the PMTiles file for this location';
COMMENT ON COLUMN locations.is_public IS 'Whether this location is visible to all users';
COMMENT ON COLUMN locations.date_modified IS 'Timestamp when the location was last modified';

-- Persons columns
COMMENT ON COLUMN persons.plot_id IS 'Foreign key to the plots table, indicating which plot this person is buried in';
COMMENT ON COLUMN persons.full_name IS 'Computed full name combining title, forename, middle name, and surname';
COMMENT ON COLUMN persons.deceased IS 'Boolean flag indicating if this person is deceased (true) or alive (false)';
COMMENT ON COLUMN persons.person_of_interest IS 'Boolean flag indicating if this person is of special interest';
COMMENT ON COLUMN persons.veteran IS 'Boolean flag indicating if this person was a military veteran';

-- Person images columns
COMMENT ON COLUMN person_images.person_id IS 'Foreign key to the persons table, indicating which person this image belongs to';
COMMENT ON COLUMN person_images.thumbnail_data IS 'Base64 encoded thumbnail image (200x200px) stored locally for fast access';
COMMENT ON COLUMN person_images.cloud_url IS 'URL to the full resolution image in cloud storage (Vercel Blob)';
COMMENT ON COLUMN person_images.data IS 'Legacy full-size base64 data for backward compatibility during migration';
COMMENT ON COLUMN person_images.dimensions IS 'JSON string of original image dimensions (e.g., {"width": 4000, "height": 3000})';

-- ============================================================================
-- INDEX COMMENTS
-- ============================================================================
COMMENT ON INDEX idx_plots_location_date IS 'Composite index for location-filtered queries ordered by date';
