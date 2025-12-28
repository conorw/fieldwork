-- Quick fix for location_invites RLS policies
-- This fixes the "permission denied for table users" error
-- Run this in Supabase SQL Editor

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their invites" ON location_invites;
DROP POLICY IF EXISTS "Owners and admins can create invites" ON location_invites;
DROP POLICY IF EXISTS "Owners and admins can update invites" ON location_invites;
DROP POLICY IF EXISTS "Owners and admins can delete invites" ON location_invites;

-- Policy: Owners and admins can read invites for their locations
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

