# PowerSync Sync Queries Configuration

This document outlines the PowerSync sync queries that need to be configured in the PowerSync backend dashboard to sync data based on user authentication and location membership.

## Overview

PowerSync sync queries are configured server-side in the PowerSync dashboard. These queries determine what data is synced to each user's local database. The queries will automatically respect the Row Level Security (RLS) policies configured in Supabase.

## Required Sync Queries

### 1. Locations Table

Sync locations where the user is an owner or member, or where the location is public:

```sql
SELECT * FROM locations
WHERE owner_id = auth.uid()
   OR id IN (
     SELECT location_id FROM location_members WHERE user_id = auth.uid()
   )
   OR is_public = true
```

**Note:** The RLS policy on `locations` will automatically filter this based on:
- Ownership (`owner_id = auth.uid()`)
- Public status (`is_public = true`)
- Membership is handled via PowerSync filtering, not RLS (to prevent recursion)

### 2. Location Members Table

Sync membership records for locations the user has access to:

```sql
SELECT * FROM location_members
WHERE user_id = auth.uid()
   OR location_id IN (
     SELECT id FROM locations WHERE owner_id = auth.uid()
   )
   OR location_id IN (
     SELECT location_id FROM location_members WHERE user_id = auth.uid()
   )
```

**Note:** The RLS policy will filter this to:
- User's own membership records
- Members of locations the user owns

### 3. Location Invites Table

Sync invites for the user's email or for locations the user owns/admin:

```sql
SELECT * FROM location_invites
WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
   OR location_id IN (
     SELECT id FROM locations WHERE owner_id = auth.uid()
   )
   OR location_id IN (
     SELECT location_id FROM location_members 
     WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
   )
```

### 4. Location Requests Table

Sync requests created by the user or for locations the user owns/admin:

```sql
SELECT * FROM location_requests
WHERE user_id = auth.uid()
   OR location_id IN (
     SELECT id FROM locations WHERE owner_id = auth.uid()
   )
   OR location_id IN (
     SELECT location_id FROM location_members 
     WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
   )
```

### 5. Plots Table

Sync plots for locations where the user is a member:

```sql
SELECT * FROM plots
WHERE location_id IN (
  SELECT id FROM locations WHERE owner_id = auth.uid()
  UNION
  SELECT location_id FROM location_members WHERE user_id = auth.uid()
  UNION
  SELECT id FROM locations WHERE is_public = true
)
```

**Note:** The RLS policy uses the `is_location_member()` helper function to check membership.

### 6. Persons Table

Sync persons for plots in locations where the user is a member:

```sql
SELECT * FROM persons
WHERE plot_id IN (
  SELECT id FROM plots
  WHERE location_id IN (
    SELECT id FROM locations WHERE owner_id = auth.uid()
    UNION
    SELECT location_id FROM location_members WHERE user_id = auth.uid()
    UNION
    SELECT id FROM locations WHERE is_public = true
  )
)
```

### 7. Plot Images Table

Sync plot images for plots in locations where the user is a member:

```sql
SELECT * FROM plot_images
WHERE plot_id IN (
  SELECT id FROM plots
  WHERE location_id IN (
    SELECT id FROM locations WHERE owner_id = auth.uid()
    UNION
    SELECT location_id FROM location_members WHERE user_id = auth.uid()
    UNION
    SELECT id FROM locations WHERE is_public = true
  )
)
```

### 8. Person Images Table

Sync person images for persons in plots where the user is a member:

```sql
SELECT * FROM person_images
WHERE person_id IN (
  SELECT id FROM persons
  WHERE plot_id IN (
    SELECT id FROM plots
    WHERE location_id IN (
      SELECT id FROM locations WHERE owner_id = auth.uid()
      UNION
      SELECT location_id FROM location_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM locations WHERE is_public = true
    )
  )
)
```

### 9. Headstone Training Examples Table

Sync reviewed training examples for locations the user can access (needed for onboarding + train kickoff offline):

```sql
SELECT * FROM headstone_training_examples
WHERE location_id IN (
  SELECT id FROM locations WHERE owner_id = auth.uid()
  UNION
  SELECT location_id FROM location_members WHERE user_id = auth.uid()
)
```

**Note:** Apply migration `007_location_ai_training.sql` before enabling this sync query. Locations also gain `ai_status`, `adapter_url`, `adapter_version`, `ai_train_error`, `ai_train_job_id` — covered by the existing locations `SELECT *` query once the columns exist.
## Important Notes

1. **RLS Policies:** All sync queries will automatically respect the RLS policies configured in Supabase. The queries above are optimized to work with the RLS policies defined in `003_rls_policies.sql`.

2. **Recursion Prevention:** The RLS policies are designed to prevent infinite recursion. The `locations` SELECT policy avoids querying `location_members` directly, and membership filtering happens at the PowerSync sync query level.

3. **Offline Support:** Once data is synced, users can work offline. PowerSync will automatically sync changes when the connection is restored.

4. **Authentication:** All sync queries use `auth.uid()` which is automatically provided by PowerSync based on the authenticated user's session.

5. **Settings Table:** The `settings` table is marked as `localOnly: true` in the PowerSync schema, so it doesn't need a sync query.

## Configuration Steps

1. Log into the PowerSync dashboard
2. Navigate to the Sync Rules/Buckets configuration
3. Add each of the sync queries above for their respective tables
4. Ensure the queries use the authenticated user context (`auth.uid()`)
5. Test sync by logging in as different users and verifying they only see data for their locations

## Testing

After configuring the sync queries:

1. Log in as a user who owns a location
2. Verify the location and its plots/persons/images sync to the local database
3. Log in as a user who is a member of a location
4. Verify they can see the location and its data
5. Log in as a user with no location access
6. Verify they only see public locations (if any)
7. Test offline functionality by disconnecting and verifying data is still accessible

