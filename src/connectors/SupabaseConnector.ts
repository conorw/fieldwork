import {
  AbstractPowerSyncDatabase,
  BaseObserver,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials,
} from "@powersync/web";

import { Session, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "@/lib/supabase/client";

export type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  powersyncUrl: string;
};

/// Postgres Response codes that we cannot recover from by retrying.
const FATAL_RESPONSE_CODES = [
  // Class 22 — Data Exception
  // Examples include data type mismatch.
  new RegExp("^22...$"),
  // Class 23 — Integrity Constraint Violation.
  // Examples include NOT NULL, FOREIGN KEY and UNIQUE violations.
  new RegExp("^23...$"),
  // INSUFFICIENT PRIVILEGE - typically a row-level security violation
  new RegExp("^42501$"),
];

export type SupabaseConnectorListener = {
  initialized: () => void;
  sessionStarted: (session: Session) => void;
};

export class SupabaseConnector
  extends BaseObserver<SupabaseConnectorListener>
  implements PowerSyncBackendConnector
{
  readonly client: SupabaseClient;
  readonly config: SupabaseConfig;

  ready: boolean;

  currentSession: Session | null;


  constructor() {
    super();
    this.config = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      powersyncUrl: import.meta.env.VITE_POWERSYNC_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    };

    // Use the shared Supabase client instance to ensure session sharing
    // This ensures the connector uses the same session storage as the auth store
    this.client = createSupabaseClient();
    this.currentSession = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) {
      return;
    }

    // Listen for auth state changes to handle automatic session refresh
    this.client.auth.onAuthStateChange((event, session) => {
      console.log("🔄 PowerSync: Auth state changed:", {
        event,
        hasSession: !!session,
      });

      // Handle all session-related events
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        if (session) {
          console.log("🔄 PowerSync: Updating session from auth state change");
          this.updateSession(session);
        }
      } else if (event === "SIGNED_OUT") {
        this.updateSession(null);
      }
    });

    // Get initial session
    try {
      const sessionResponse = await this.client.auth.getSession();
      if (sessionResponse.data.session) {
        this.updateSession(sessionResponse.data.session);
        console.log("🔄 PowerSync: Connector initialized with session");
      } else {
        console.log("🔄 PowerSync: Connector initialized without session (will connect when user logs in)");
      }
    } catch (error) {
      console.warn("⚠️ PowerSync: Error getting session during init:", error);
    }

    this.ready = true;
    this.iterateListeners((cb) => cb.initialized?.());
  }

  async login(username: string, password: string) {
    const {
      data: { session },
      error,
    } = await this.client.auth.signInWithPassword({
      email: username,
      password: password,
    });

    if (error) {
      throw error;
    }

    this.updateSession(session);
  }

  async fetchCredentials() {
    // Ensure init() has been called to load persisted session
    if (!this.ready) {
      console.log(
        "🔄 PowerSync: Connector not initialized, initializing now...",
      );
      await this.init();
    }

    // Always check for session from Supabase client (which checks localStorage)
    // This ensures we get the latest session even if it was updated elsewhere
    let session = this.currentSession;
    
    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await this.client.auth.getSession();
      
      if (sessionError) {
        console.warn("⚠️ PowerSync: Error getting session:", sessionError);
      } else if (currentSession) {
        // Update our cached session if we found one
        if (!this.currentSession || this.currentSession.access_token !== currentSession.access_token) {
          console.log("🔄 PowerSync: Found session from storage, updating");
          this.updateSession(currentSession);
          session = currentSession;
        }
      }
    } catch (error) {
      console.warn("⚠️ PowerSync: Error getting persisted session:", error);
    }

    // If still no session, wait a bit for auth store to initialize
    // This handles race conditions where PowerSync initializes before auth is ready
    if (!session) {
      console.log("🔄 PowerSync: No session found, waiting for auth initialization...");
      // Wait up to 10 seconds for auth to initialize (longer wait for slower devices)
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
          const { data: { session: newSession }, error: checkError } = await this.client.auth.getSession();
          if (checkError) {
            console.debug("PowerSync: Error checking session during wait:", checkError);
            continue;
          }
          if (newSession) {
            console.log("🔄 PowerSync: Session found after waiting");
            this.updateSession(newSession);
            session = newSession;
            break;
          }
        } catch (error) {
          // Continue waiting if there's an error getting session
          console.debug("PowerSync: Error checking session during wait:", error);
        }
      }
    }

    if (!session) {
      // Don't throw immediately - PowerSync will retry when auth is ready
      // This allows the app to work offline until user logs in
      console.warn("⚠️ PowerSync: No authenticated session found. PowerSync will connect when user logs in.");
      throw new Error("No authenticated session found. Please log in.");
    }

    // Check if session is expired or will expire soon (within 5 minutes)
    if (session && session.expires_at) {
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesFromNow = now + 5 * 60; // 5 minutes in seconds

      console.debug("🔄 PowerSync: Session check:", {
        expiresAt,
        now,
        expiresInMinutes: Math.floor((expiresAt - now) / 60),
        needsRefresh: expiresAt <= fiveMinutesFromNow,
      });

      if (expiresAt <= fiveMinutesFromNow) {
        console.log(
          "🔄 PowerSync: Session expired or expiring soon, refreshing...",
        );
        try {
          const {
            data: { session: refreshedSession },
            error,
          } = await this.client.auth.refreshSession();
          if (error) {
            console.error("❌ PowerSync: Failed to refresh session:", error);
            throw new Error("Session expired and refresh failed. Please log in again.");
          } else {
            console.log("✅ PowerSync: Session refreshed successfully");
            this.updateSession(refreshedSession);
            session = refreshedSession;
          }
        } catch (refreshError) {
          console.error(
            "❌ PowerSync: Error refreshing session:",
            refreshError,
          );
          throw new Error("Session expired and refresh failed. Please log in again.");
        }
      }
    }

    if (!session) {
      throw new Error("Failed to obtain valid session");
    }

    console.debug("🔄 PowerSync: Using session token:", {
      expiresAt: session.expires_at,
      expiresInMinutes: session.expires_at
        ? Math.floor((session.expires_at - Math.floor(Date.now() / 1000)) / 60)
        : "unknown",
    });

    return {
      endpoint: this.config.powersyncUrl,
      token: session.access_token ?? "",
    } satisfies PowerSyncCredentials;
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    console.log("🔄 PowerSync: Starting upload process to Supabase...");

    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      console.log("ℹ️ PowerSync: No pending transactions to upload");
      return;
    }

    console.log("🔄 PowerSync: Found transaction to upload:", {
      id: (transaction as any).id,
      crudCount: transaction.crud.length,
      tables: [...new Set(transaction.crud.map((op) => op.table))],
    });

    let lastOp: CrudEntry | null = null;
    try {
      // Note: If transactional consistency is important, use database functions
      // or edge functions to process the entire transaction in a single call.
      for (const op of transaction.crud) {
        lastOp = op;
        console.log("🔄 PowerSync: Processing operation:", {
          table: op.table,
          operation: op.op,
          id: op.id,
        });

        const table = this.client.from(op.table);
        let result: any;
        switch (op.op) {
          case UpdateType.PUT:
            const record = { ...op.opData, id: op.id };
            console.log("🔄 PowerSync: Upserting record to Supabase:", record);
            result = await table.upsert(record);
            break;
          case UpdateType.PATCH:
            console.log("🔄 PowerSync: Updating record in Supabase:", {
              id: op.id,
              data: op.opData,
            });
            result = await table.update(op.opData).eq("id", op.id);
            break;
          case UpdateType.DELETE:
            console.log("🔄 PowerSync: Deleting record from Supabase:", {
              id: op.id,
            });
            result = await table.delete().eq("id", op.id);
            break;
        }

        if (result.error) {
          console.error(
            "❌ PowerSync: Supabase operation failed:",
            result.error,
          );
          result.error.message = `Could not update Supabase. Received error: ${result.error.message}`;
          throw result.error;
        } else {
          console.log("✅ PowerSync: Supabase operation successful:", {
            table: op.table,
            operation: op.op,
            id: op.id,
          });
        }
      }

      await transaction.complete();
      console.log(
        "✅ PowerSync: Transaction completed successfully and marked as synced",
      );
    } catch (ex: any) {
      console.error("❌ PowerSync: Upload failed:", ex);
      if (
        typeof ex.code == "string" &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))
      ) {
        /**
         * Instead of blocking the queue with these errors,
         * discard the (rest of the) transaction.
         *
         * Note that these errors typically indicate a bug in the application.
         * If protecting against data loss is important, save the failing records
         * elsewhere instead of discarding, and/or notify the user.
         */
        console.error(
          "❌ PowerSync: Fatal error - discarding transaction:",
          lastOp,
          ex,
        );
        await transaction.complete();
      } else {
        // Error may be retryable - e.g. network error or temporary server error.
        // Throwing an error here causes this call to be retried after a delay.
        console.log(
          "🔄 PowerSync: Retryable error - will retry later:",
          ex.message,
        );
        throw ex;
      }
    }
  }

  updateSession(session: Session | null) {
    this.currentSession = session;
    if (!session) {
      return;
    }
    this.iterateListeners((cb) => cb.sessionStarted?.(session));
  }


  async logout() {
    console.log("logging out");
    await this.client.auth.signOut();
  }

  async getSession() {
    console.log("getting session");
    const {
      data: { session: _session },
      error: _error,
    } = await this.client.auth.getSession();
  }
}
