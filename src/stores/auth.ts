import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(null);
  const user = ref<User | null>(null);
  const isLoading = ref(false);

  const isAuthenticated = computed(() => !!session.value && !!user.value);

  let initPromise: Promise<void> | null = null;

  const init = async () => {
    // Return existing promise if initialization is in progress
    if (initPromise) {
      return initPromise;
    }

    // If already initialized and has session, return immediately
    if (session.value && user.value) {
      return Promise.resolve();
    }

    isLoading.value = true;
    initPromise = (async () => {
      try {
        const supabase = createSupabaseClient();

        // Get the current session from Supabase (reads from localStorage)
        const {
          data: { session: currentSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Error getting session:", sessionError);
        }

        if (currentSession) {
          session.value = currentSession;
          user.value = currentSession.user;
        } else {
          console.log("ℹ️ No session found in storage");
          session.value = null;
          user.value = null;
        }

        // Listen for auth state changes (only set up once)
        supabase.auth.onAuthStateChange(async (event, newSession) => {
          console.log("🔄 Auth state changed:", event, newSession?.user?.email);
          if (newSession) {
            session.value = newSession;
            user.value = newSession.user;

            // Initialize PowerSync when user signs in
            if (event === "SIGNED_IN") {
              try {
                const { usePowerSyncStore } = await import("./powersync");
                const powerSyncStore = usePowerSyncStore();
                if (!powerSyncStore.isInitialized) {
                  console.log("🔄 Initializing PowerSync after sign in...");
                  powerSyncStore.initialize().catch((error: Error) => {
                    console.error(
                      "Failed to initialize PowerSync after sign in:",
                      error,
                    );
                  });
                }
              } catch (error) {
                console.error("Error importing PowerSync store:", error);
              }
            }
          } else {
            session.value = null;
            user.value = null;
          }
        });
      } catch (error) {
        console.error("❌ Auth init error:", error);
        session.value = null;
        user.value = null;
      } finally {
        isLoading.value = false;
        initPromise = null;
      }
    })();

    return initPromise;
  };

  const setSession = async (newSession: Session) => {
    session.value = newSession;
    user.value = newSession.user;

    // Initialize PowerSync when session is set (e.g., after login)
    if (newSession) {
      try {
        const { usePowerSyncStore } = await import("./powersync");
        const powerSyncStore = usePowerSyncStore();
        if (!powerSyncStore.isInitialized) {
          console.log("🔄 Initializing PowerSync after session set...");
          powerSyncStore.initialize().catch((error: Error) => {
            console.error(
              "Failed to initialize PowerSync after session set:",
              error,
            );
          });
        }
      } catch (error) {
        console.error("Error importing PowerSync store:", error);
      }
    }
  };

  const logout = async () => {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    session.value = null;
    user.value = null;
  };

  const checkUserHasLocations = async (): Promise<boolean> => {
    if (!user.value) return false;

    // Try PowerSync first (works offline)
    try {
      const { usePowerSyncStore } = await import("./powersync");
      const powerSyncStore = usePowerSyncStore();

      if (powerSyncStore.powerSync && powerSyncStore.isInitialized) {
        // Check if user owns any locations (from local PowerSync database)
        const ownedLocations = await powerSyncStore.powerSync.getAll(
          "SELECT id FROM locations WHERE owner_id = ? LIMIT 1",
          [user.value.id],
        );

        if (ownedLocations.length > 0) {
          return true;
        }

        // Check if user is a member of any locations (from local PowerSync database)
        const memberLocations = await powerSyncStore.powerSync.getAll(
          "SELECT location_id FROM location_members WHERE user_id = ? LIMIT 1",
          [user.value.id],
        );

        if (memberLocations.length > 0) {
          return true;
        }

        // No locations found in local database
        return false;
      }
    } catch (error) {
      console.warn(
        "PowerSync not available for location check, falling back to Supabase:",
        error,
      );
    }

    // Fallback to Supabase (requires network)
    const supabase = createSupabaseClient();

    try {
      // Check if user owns any locations (direct query, no recursion)
      const { count: ownedCount, error: ownedError } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.value.id)
        .limit(1);

      if (ownedError) {
        console.error("Error checking owned locations:", ownedError);
      } else if ((ownedCount ?? 0) > 0) {
        return true;
      }

      // Also check if user is a member of any locations (query location_members directly)
      // This is safe because location_members SELECT policy only checks user_id directly
      const { count: memberCount, error: memberError } = await supabase
        .from("location_members")
        .select("location_id", { count: "exact", head: true })
        .eq("user_id", user.value.id)
        .limit(1);

      if (memberError) {
        console.error("Error checking member locations:", memberError);
        // If offline, assume user has locations if session exists (optimistic)
        // This allows app to work offline after initial login
        return true;
      }

      // User has locations if they own any OR are a member of any
      return (memberCount ?? 0) > 0;
    } catch (error) {
      // Network error - assume user has locations if session exists (optimistic offline mode)
      console.warn(
        "Network error checking locations, assuming user has locations for offline mode:",
        error,
      );
      return true;
    }
  };

  return {
    session,
    user,
    isLoading,
    isAuthenticated,
    init,
    setSession,
    logout,
    checkUserHasLocations,
  };
});
