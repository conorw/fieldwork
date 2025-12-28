-- Migration 005: Add user_email to location_members table
-- This allows us to display member emails without querying auth.users

-- Add user_email column
ALTER TABLE location_members ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

-- Create index on user_email for faster lookups
CREATE INDEX IF NOT EXISTS idx_location_members_user_email ON location_members(user_email);

-- Backfill existing records with user emails from auth.users
-- This requires appropriate RLS policies on auth.users for the migration user
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'location_members' AND column_name = 'user_email') THEN
    UPDATE location_members lm
    SET user_email = au.email
    FROM auth.users au
    WHERE lm.user_id = au.id
    AND lm.user_email IS NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If we can't access auth.users, just log and continue
    RAISE NOTICE 'Could not update existing location_members with emails: %', SQLERRM;
END $$;

COMMENT ON COLUMN location_members.user_email IS 'Email of the user who is a member of the location';

