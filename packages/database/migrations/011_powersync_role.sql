-- PowerSync replication role + publication (Supabase)
-- Password is set in the live project; rotate via ALTER ROLE if needed.
-- Docs: https://docs.powersync.com/integrations/supabase/guide

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
    RAISE EXCEPTION 'powersync_role must be created with a password (see PowerSync dashboard setup)';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    CREATE PUBLICATION powersync FOR TABLE
      public.locations,
      public.location_members,
      public.location_invites,
      public.location_requests,
      public.plots,
      public.plot_images,
      public.persons,
      public.person_images,
      public.settings,
      public.headstone_training_examples,
      public.ai_global_models;
  END IF;
END $$;
