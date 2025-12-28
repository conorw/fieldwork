-- Migration 003: Row Level Security (RLS) Policies
-- This migration adds RLS policies to secure data based on location membership

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE plot_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_images ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
-- NOTE: These functions use SECURITY DEFINER to bypass RLS when checking membership.
-- For these functions to work properly and avoid recursion, the function owner
-- must have BYPASSRLS privilege. After creating these functions, run:
-- ALTER FUNCTION is_location_member OWNER TO postgres;
-- ALTER FUNCTION is_location_owner_or_admin OWNER TO postgres;
-- ALTER FUNCTION get_user_location_role OWNER TO postgres;
-- (Or grant BYPASSRLS to the current function owner)

-- Function to check if user is a member of a location
-- Uses SECURITY DEFINER to bypass RLS and prevent recursion
-- IMPORTANT: This function must be owned by a user with BYPASSRLS privilege
-- After creating, run: ALTER FUNCTION is_location_member OWNER TO postgres;
CREATE OR REPLACE FUNCTION is_location_member(location_id_param VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
  result BOOLEAN;
BEGIN
  -- Check ownership first (no RLS issue, queries locations table)
  IF EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_id_param
    AND locations.owner_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  
  -- Check membership - SECURITY DEFINER should bypass RLS if function owner has BYPASSRLS
  -- But to be safe, we'll use a direct query that should work
  PERFORM 1 FROM location_members
  WHERE location_members.location_id = location_id_param
  AND location_members.user_id = auth.uid()
  LIMIT 1;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Function to check if user is owner or admin of a location
-- Uses SECURITY DEFINER to bypass RLS and prevent recursion
-- IMPORTANT: This function must be owned by a user with BYPASSRLS privilege
-- After creating, run: ALTER FUNCTION is_location_owner_or_admin OWNER TO postgres;
CREATE OR REPLACE FUNCTION is_location_owner_or_admin(location_id_param VARCHAR(255))
RETURNS BOOLEAN AS $$
BEGIN
  -- Check ownership first (no RLS issue, queries locations table)
  IF EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_id_param
    AND locations.owner_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  
  -- Check admin role - SECURITY DEFINER should bypass RLS if function owner has BYPASSRLS
  PERFORM 1 FROM location_members
  WHERE location_members.location_id = location_id_param
  AND location_members.user_id = auth.uid()
  AND location_members.role IN ('owner', 'admin')
  LIMIT 1;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Function to get user's role in a location
-- Uses SECURITY DEFINER to bypass RLS and prevent recursion
CREATE OR REPLACE FUNCTION get_user_location_role(location_id_param VARCHAR(255))
RETURNS VARCHAR(50) AS $$
DECLARE
  user_role VARCHAR(50);
BEGIN
  -- Check if user is owner
  IF EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_id_param
    AND locations.owner_id = auth.uid()
  ) THEN
    RETURN 'owner';
  END IF;
  
  -- Check membership
  SELECT role INTO user_role
  FROM location_members
  WHERE location_members.location_id = location_id_param
  AND location_members.user_id = auth.uid();
  
  RETURN COALESCE(user_role, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================================
-- LOCATIONS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read their locations" ON locations;
DROP POLICY IF EXISTS "Users can create locations" ON locations;
DROP POLICY IF EXISTS "Owners and admins can update locations" ON locations;
DROP POLICY IF EXISTS "Owners can delete locations" ON locations;

-- Policy: Users can read locations they're members of or own
-- CRITICAL: Must avoid querying location_members to prevent infinite recursion
-- Strategy: Only check ownership and public status here. Membership filtering happens
-- at the application/PowerSync level via location_members table queries.
-- This breaks the recursion cycle: locations policy -> location_members policy -> locations policy
CREATE POLICY "Users can read their locations"
ON locations FOR SELECT
TO authenticated
USING (
  -- User owns the location (direct check, no recursion)
  owner_id = auth.uid()
  -- OR location is public (any authenticated user can see public locations)
  OR (
    COALESCE(is_public::text, 'false') = 'true'
    AND auth.uid() IS NOT NULL
  )
  -- Note: Member access is handled by PowerSync filtering, not RLS policy
  -- This prevents recursion while still securing data
);

-- Policy: Users can insert locations (they become owner)
CREATE POLICY "Users can create locations"
ON locations FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- Policy: Owners and admins can update their locations
CREATE POLICY "Owners and admins can update locations"
ON locations FOR UPDATE
USING (is_location_owner_or_admin(id))
WITH CHECK (is_location_owner_or_admin(id));

-- Policy: Owners can delete their locations
CREATE POLICY "Owners can delete locations"
ON locations FOR DELETE
USING (owner_id = auth.uid());

-- ============================================================================
-- LOCATION_MEMBERS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read members of their locations" ON location_members;
DROP POLICY IF EXISTS "Owners and admins can add members" ON location_members;
DROP POLICY IF EXISTS "Owners and admins can update member roles" ON location_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON location_members;

-- Policy: Users can read members of locations they're members of
-- CRITICAL: This policy must be extremely simple to avoid infinite recursion
-- The policy only checks:
--   1. Direct user_id match (user's own record)
--   2. Ownership via locations table (no location_members query)
-- This prevents recursion because we never query location_members within the policy
CREATE POLICY "Users can read members of their locations"
ON location_members FOR SELECT
TO authenticated
USING (
  -- Case 1: User can always see their own membership record (direct check, no recursion)
  location_members.user_id = auth.uid()
  -- Case 2: User owns the location (check locations table only, no recursion)
  OR EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_members.location_id
    AND locations.owner_id = auth.uid()
  )
);

-- Policy: Owners and admins can insert members
-- Check ownership directly to avoid recursion
CREATE POLICY "Owners and admins can add members"
ON location_members FOR INSERT
WITH CHECK (
  -- User owns the location
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_members.location_id
    AND locations.owner_id = auth.uid()
  )
  AND (
    -- Allow adding owner role if the user is adding themselves as owner
    -- (This handles the initial owner creation when a location is created)
    (location_members.role = 'owner' AND location_members.user_id = auth.uid())
    OR
    -- Can't add another owner (only one owner) - for non-owner inserts
    location_members.role != 'owner'
  )
);

-- Policy: Owners and admins can update member roles
-- Check ownership directly to avoid recursion
CREATE POLICY "Owners and admins can update member roles"
ON location_members FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_members.location_id
    AND locations.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_members.location_id
    AND locations.owner_id = auth.uid()
  )
  AND (
    -- Can't change to owner role (only one owner)
    location_members.role != 'owner'
    OR NOT EXISTS (
      SELECT 1 FROM locations
      WHERE locations.id = location_members.location_id
      AND locations.owner_id IS NOT NULL
    )
  )
);

-- Policy: Owners and admins can remove members (but not themselves if they're the only owner)
-- Check ownership directly to avoid recursion
CREATE POLICY "Owners and admins can remove members"
ON location_members FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_members.location_id
    AND locations.owner_id = auth.uid()
  )
  AND NOT (
    -- Prevent removing the only owner
    location_members.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM locations
      WHERE locations.id = location_members.location_id
      AND locations.owner_id = auth.uid()
    )
  )
);

-- ============================================================================
-- LOCATION_INVITES TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read their invites" ON location_invites;
DROP POLICY IF EXISTS "Owners and admins can create invites" ON location_invites;
DROP POLICY IF EXISTS "Owners and admins can update invites" ON location_invites;
DROP POLICY IF EXISTS "Owners and admins can delete invites" ON location_invites;

-- Policy: Owners and admins can read invites for their locations
-- Note: We can't check if email matches current user's email because auth.users
-- is not accessible via RLS. Users will see their invites when they click
-- the invite link (which doesn't require querying this table).
CREATE POLICY "Users can read their invites"
ON location_invites FOR SELECT
USING (
  -- Owners can see all invites for their locations
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_invites.location_id
    AND locations.owner_id = auth.uid()
  )
  -- Admins can also see invites for locations they admin
  OR EXISTS (
    SELECT 1 FROM location_members
    WHERE location_members.location_id = location_invites.location_id
    AND location_members.user_id = auth.uid()
    AND location_members.role IN ('owner', 'admin')
  )
);

-- Policy: Owners and admins can create invites
CREATE POLICY "Owners and admins can create invites"
ON location_invites FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_invites.location_id
    AND locations.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM location_members
    WHERE location_members.location_id = location_invites.location_id
    AND location_members.user_id = auth.uid()
    AND location_members.role IN ('owner', 'admin')
  )
);

-- Policy: Owners and admins can update invites
CREATE POLICY "Owners and admins can update invites"
ON location_invites FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_invites.location_id
    AND locations.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM location_members
    WHERE location_members.location_id = location_invites.location_id
    AND location_members.user_id = auth.uid()
    AND location_members.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_invites.location_id
    AND locations.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM location_members
    WHERE location_members.location_id = location_invites.location_id
    AND location_members.user_id = auth.uid()
    AND location_members.role IN ('owner', 'admin')
  )
);

-- Policy: Owners and admins can delete invites
CREATE POLICY "Owners and admins can delete invites"
ON location_invites FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_invites.location_id
    AND locations.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM location_members
    WHERE location_members.location_id = location_invites.location_id
    AND location_members.user_id = auth.uid()
    AND location_members.role IN ('owner', 'admin')
  )
);

-- ============================================================================
-- LOCATION_REQUESTS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read their requests" ON location_requests;
DROP POLICY IF EXISTS "Users can create join requests" ON location_requests;
DROP POLICY IF EXISTS "Owners and admins can update requests" ON location_requests;
DROP POLICY IF EXISTS "Users can delete their requests" ON location_requests;

-- Policy: Users can read their own requests
CREATE POLICY "Users can read their requests"
ON location_requests FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_requests.location_id
    AND locations.owner_id = auth.uid()
  )
);

-- Policy: Authenticated users can create join requests
CREATE POLICY "Users can create join requests"
ON location_requests FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND NOT EXISTS (
    -- Can't request if already a member
    SELECT 1 FROM location_members
    WHERE location_members.location_id = location_requests.location_id
    AND location_members.user_id = auth.uid()
  )
);

-- Policy: Owners and admins can update requests (approve/reject)
CREATE POLICY "Owners and admins can update requests"
ON location_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_requests.location_id
    AND locations.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM locations
    WHERE locations.id = location_requests.location_id
    AND locations.owner_id = auth.uid()
  )
);

-- Policy: Users can delete their own pending requests
CREATE POLICY "Users can delete their requests"
ON location_requests FOR DELETE
USING (
  user_id = auth.uid()
  AND status = 'pending'
);

-- ============================================================================
-- PLOTS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read plots in their locations" ON plots;
DROP POLICY IF EXISTS "Users can create plots in their locations" ON plots;
DROP POLICY IF EXISTS "Users can update plots in their locations" ON plots;
DROP POLICY IF EXISTS "Users can delete plots in their locations" ON plots;

-- Policy: Users can read plots in locations they're members of
CREATE POLICY "Users can read plots in their locations"
ON plots FOR SELECT
USING (
  location_id IS NULL
  OR is_location_member(location_id)
);

-- Policy: Users can create plots in locations they're members of
CREATE POLICY "Users can create plots in their locations"
ON plots FOR INSERT
WITH CHECK (
  location_id IS NULL
  OR is_location_member(location_id)
);

-- Policy: Users can update plots in locations they're members of
CREATE POLICY "Users can update plots in their locations"
ON plots FOR UPDATE
USING (
  location_id IS NULL
  OR is_location_member(location_id)
)
WITH CHECK (
  location_id IS NULL
  OR is_location_member(location_id)
);

-- Policy: Users can delete plots in locations they're members of
CREATE POLICY "Users can delete plots in their locations"
ON plots FOR DELETE
USING (
  location_id IS NULL
  OR is_location_member(location_id)
);

-- ============================================================================
-- PERSONS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read persons in their locations" ON persons;
DROP POLICY IF EXISTS "Users can create persons in their locations" ON persons;
DROP POLICY IF EXISTS "Users can update persons in their locations" ON persons;
DROP POLICY IF EXISTS "Users can delete persons in their locations" ON persons;

-- Policy: Users can read persons in plots from their locations
CREATE POLICY "Users can read persons in their locations"
ON persons FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = persons.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can create persons in plots from their locations
CREATE POLICY "Users can create persons in their locations"
ON persons FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = persons.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can update persons in plots from their locations
CREATE POLICY "Users can update persons in their locations"
ON persons FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = persons.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = persons.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can delete persons in plots from their locations
CREATE POLICY "Users can delete persons in their locations"
ON persons FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = persons.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- ============================================================================
-- PLOT_IMAGES TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read plot images in their locations" ON plot_images;
DROP POLICY IF EXISTS "Users can create plot images in their locations" ON plot_images;
DROP POLICY IF EXISTS "Users can update plot images in their locations" ON plot_images;
DROP POLICY IF EXISTS "Users can delete plot images in their locations" ON plot_images;

-- Policy: Users can read plot images in their locations
CREATE POLICY "Users can read plot images in their locations"
ON plot_images FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = plot_images.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can create plot images in their locations
CREATE POLICY "Users can create plot images in their locations"
ON plot_images FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = plot_images.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can update plot images in their locations
CREATE POLICY "Users can update plot images in their locations"
ON plot_images FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = plot_images.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = plot_images.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can delete plot images in their locations
CREATE POLICY "Users can delete plot images in their locations"
ON plot_images FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM plots
    WHERE plots.id = plot_images.plot_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- ============================================================================
-- PERSON_IMAGES TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read person images in their locations" ON person_images;
DROP POLICY IF EXISTS "Users can create person images in their locations" ON person_images;
DROP POLICY IF EXISTS "Users can update person images in their locations" ON person_images;
DROP POLICY IF EXISTS "Users can delete person images in their locations" ON person_images;

-- Policy: Users can read person images in their locations
CREATE POLICY "Users can read person images in their locations"
ON person_images FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM persons
    JOIN plots ON plots.id = persons.plot_id
    WHERE persons.id = person_images.person_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can create person images in their locations
CREATE POLICY "Users can create person images in their locations"
ON person_images FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM persons
    JOIN plots ON plots.id = persons.plot_id
    WHERE persons.id = person_images.person_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can update person images in their locations
CREATE POLICY "Users can update person images in their locations"
ON person_images FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM persons
    JOIN plots ON plots.id = persons.plot_id
    WHERE persons.id = person_images.person_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM persons
    JOIN plots ON plots.id = persons.plot_id
    WHERE persons.id = person_images.person_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- Policy: Users can delete person images in their locations
CREATE POLICY "Users can delete person images in their locations"
ON person_images FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM persons
    JOIN plots ON plots.id = persons.plot_id
    WHERE persons.id = person_images.person_id
    AND (
      plots.location_id IS NULL
      OR is_location_member(plots.location_id)
    )
  )
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION is_location_member IS 'Checks if the current user is a member or owner of a location. Requires function owner to have BYPASSRLS to prevent recursion.';
COMMENT ON FUNCTION is_location_owner_or_admin IS 'Checks if the current user is the owner or an admin of a location. Requires function owner to have BYPASSRLS to prevent recursion.';
COMMENT ON FUNCTION get_user_location_role IS 'Returns the role of the current user in a location (owner, admin, member, or NULL). Requires function owner to have BYPASSRLS to prevent recursion.';

-- ============================================================================
-- GRANT BYPASSRLS TO FUNCTION OWNER (CRITICAL FOR PREVENTING RECURSION)
-- ============================================================================
-- Change function ownership to postgres (superuser) to bypass RLS
-- This prevents infinite recursion when helper functions query location_members
DO $$
BEGIN
  -- Change ownership to postgres if it exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER FUNCTION is_location_member(VARCHAR) OWNER TO postgres;
    ALTER FUNCTION is_location_owner_or_admin(VARCHAR) OWNER TO postgres;
    ALTER FUNCTION get_user_location_role(VARCHAR) OWNER TO postgres;
    RAISE NOTICE 'Function ownership changed to postgres to bypass RLS';
  ELSE
    RAISE NOTICE 'postgres role not found. Please manually change function ownership or grant BYPASSRLS.';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Insufficient privileges to change function ownership. Please run manually as superuser:';
    RAISE NOTICE 'ALTER FUNCTION is_location_member(VARCHAR) OWNER TO postgres;';
    RAISE NOTICE 'ALTER FUNCTION is_location_owner_or_admin(VARCHAR) OWNER TO postgres;';
    RAISE NOTICE 'ALTER FUNCTION get_user_location_role(VARCHAR) OWNER TO postgres;';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error changing function ownership: %', SQLERRM;
END $$;

-- ============================================================================
-- GRANT BYPASSRLS TO FUNCTION OWNER (CRITICAL FOR PREVENTING RECURSION)
-- ============================================================================
-- Uncomment and run these commands after the migration completes:
-- ALTER FUNCTION is_location_member OWNER TO postgres;
-- ALTER FUNCTION is_location_owner_or_admin OWNER TO postgres;
-- ALTER FUNCTION get_user_location_role OWNER TO postgres;
--
-- OR if you want to keep the current owner, grant BYPASSRLS:
-- DO $$
-- DECLARE
--   func_owner TEXT;
-- BEGIN
--   SELECT pg_get_function_identity_arguments(oid) INTO func_owner
--   FROM pg_proc WHERE proname = 'is_location_member';
--   EXECUTE format('ALTER ROLE %I BYPASSRLS', func_owner);
-- END $$;

