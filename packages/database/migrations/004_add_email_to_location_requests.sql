-- Migration: Add email field to location_requests table
-- This allows us to display the requester's email without querying auth.users

ALTER TABLE location_requests 
ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_location_requests_user_email ON location_requests(user_email);

-- Update existing records with email from auth.users (if possible)
-- Note: This will only work if the user running the migration has access to auth.users
-- For existing records without email, they will remain NULL
DO $$
BEGIN
  -- Try to update existing records with emails from auth.users
  -- This requires appropriate permissions
  UPDATE location_requests lr
  SET user_email = au.email
  FROM auth.users au
  WHERE lr.user_id = au.id
    AND lr.user_email IS NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- If we can't access auth.users, just log and continue
    RAISE NOTICE 'Could not update existing location_requests with emails: %', SQLERRM;
END $$;

