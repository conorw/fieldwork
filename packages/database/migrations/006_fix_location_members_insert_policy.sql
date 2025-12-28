-- Migration 006: Fix location_members INSERT policy to allow owner to insert their own record
-- This fixes the issue where creating a location fails because the owner can't insert
-- their own location_members record with role='owner'
--
-- IMPORTANT: Run this migration in Supabase SQL Editor to fix the RLS policy violation
-- The error you're seeing: "new row violates row-level security policy for table location_members"
-- will be resolved after running this migration.

-- Drop the existing policy
DROP POLICY IF EXISTS "Owners and admins can add members" ON location_members;

-- Recreate the policy with the fix
-- This policy allows:
-- 1. Location owners to add themselves as owner (for initial location creation)
-- 2. Location owners to add other users as non-owner members (admin, member)
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

-- Also update the UPDATE policy to allow owners to update their own record if needed
-- (PowerSync uses upsert which may trigger UPDATE if record exists)
DROP POLICY IF EXISTS "Owners and admins can update member roles" ON location_members;

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
    -- Allow updating to owner role if the user is updating themselves to owner
    -- (This handles the initial owner creation via upsert)
    (location_members.role = 'owner' AND location_members.user_id = auth.uid())
    OR
    -- Can't change to owner role (only one owner) - for non-owner updates
    location_members.role != 'owner'
  )
);

COMMENT ON POLICY "Owners and admins can add members" ON location_members IS 
'Allows location owners to add members. Owners can add themselves as owner (for initial creation) or add other users as non-owner members.';

COMMENT ON POLICY "Owners and admins can update member roles" ON location_members IS 
'Allows location owners to update member roles. Owners can update themselves to owner (for initial creation via upsert) or update other users to non-owner roles.';

