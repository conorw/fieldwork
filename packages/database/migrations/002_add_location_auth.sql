-- Migration 002: Add location authentication and membership
-- This migration adds ownership, membership, invites, and requests to locations

-- ============================================================================
-- UPDATE LOCATIONS TABLE
-- ============================================================================

-- Add owner_id column to locations table
ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add is_public column for public join requests
-- Check if column exists and what type it is, then add/alter accordingly
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'locations' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE locations ADD COLUMN is_public BOOLEAN DEFAULT false;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'locations' 
    AND column_name = 'is_public' 
    AND data_type = 'character varying'
  ) THEN
    -- Convert existing VARCHAR column to BOOLEAN
    ALTER TABLE locations ALTER COLUMN is_public TYPE BOOLEAN 
    USING CASE WHEN is_public = 'true' THEN true ELSE false END;
  END IF;
END $$;

-- Create index on owner_id for performance
CREATE INDEX IF NOT EXISTS idx_locations_owner_id ON locations(owner_id);

-- Create index on is_public for filtering public locations
CREATE INDEX IF NOT EXISTS idx_locations_is_public ON locations(is_public);

-- ============================================================================
-- LOCATION_MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_members (
    id VARCHAR(255) PRIMARY KEY,
    location_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at VARCHAR(255) NOT NULL,
    UNIQUE (location_id, user_id),
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for location_members
CREATE INDEX IF NOT EXISTS idx_location_members_location_id ON location_members(location_id);
CREATE INDEX IF NOT EXISTS idx_location_members_user_id ON location_members(user_id);
CREATE INDEX IF NOT EXISTS idx_location_members_role ON location_members(role);

-- ============================================================================
-- LOCATION_INVITES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_invites (
    id VARCHAR(255) PRIMARY KEY,
    location_id VARCHAR(255) NOT NULL,
    invited_by UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'member')),
    token VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    expires_at VARCHAR(255),
    created_at VARCHAR(255) NOT NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for location_invites
CREATE INDEX IF NOT EXISTS idx_location_invites_location_id ON location_invites(location_id);
CREATE INDEX IF NOT EXISTS idx_location_invites_email ON location_invites(email);
CREATE INDEX IF NOT EXISTS idx_location_invites_token ON location_invites(token);
CREATE INDEX IF NOT EXISTS idx_location_invites_status ON location_invites(status);

-- ============================================================================
-- LOCATION_REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_requests (
    id VARCHAR(255) PRIMARY KEY,
    location_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    message TEXT,
    created_at VARCHAR(255) NOT NULL,
    responded_at VARCHAR(255),
    responded_by UUID,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for location_requests
CREATE INDEX IF NOT EXISTS idx_location_requests_location_id ON location_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_location_requests_user_id ON location_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_location_requests_status ON location_requests(status);

-- ============================================================================
-- CLEAR ANONYMOUS USER DATA
-- ============================================================================

-- Delete all data created by anonymous users
-- Note: This is destructive - all anonymous data will be lost
DELETE FROM plot_images WHERE created_by = 'anonymous';
DELETE FROM person_images WHERE created_by = 'anonymous';
DELETE FROM persons WHERE created_by = 'anonymous';
DELETE FROM plots WHERE created_by = 'anonymous' OR modified_by = 'anonymous';
DELETE FROM locations WHERE created_by = 'anonymous';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN locations.owner_id IS 'User ID of the location owner';
COMMENT ON COLUMN locations.is_public IS 'Whether this location appears in public join list';
COMMENT ON TABLE location_members IS 'Many-to-many relationship between users and locations with roles';
COMMENT ON COLUMN location_members.role IS 'User role: owner, admin, or member';
COMMENT ON TABLE location_invites IS 'Pending invitations to join locations';
COMMENT ON COLUMN location_invites.token IS 'Unique token for invite link';
COMMENT ON TABLE location_requests IS 'Join requests from users to locations';

