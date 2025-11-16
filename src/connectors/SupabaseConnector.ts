import {
  AbstractPowerSyncDatabase,
  BaseObserver,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials
} from '@powersync/web';

import { Session, SupabaseClient, createClient } from '@supabase/supabase-js';

export type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  powersyncUrl: string;
};

/// Postgres Response codes that we cannot recover from by retrying.
const FATAL_RESPONSE_CODES = [
  // Class 22 — Data Exception
  // Examples include data type mismatch.
  new RegExp('^22...$'),
  // Class 23 — Integrity Constraint Violation.
  // Examples include NOT NULL, FOREIGN KEY and UNIQUE violations.
  new RegExp('^23...$'),
  // INSUFFICIENT PRIVILEGE - typically a row-level security violation
  new RegExp('^42501$')
];

export type SupabaseConnectorListener = {
  initialized: () => void;
  sessionStarted: (session: Session) => void;
};

export class SupabaseConnector extends BaseObserver<SupabaseConnectorListener> implements PowerSyncBackendConnector {
  readonly client: SupabaseClient;
  readonly config: SupabaseConfig;

  ready: boolean;

  currentSession: Session | null;
  
  // Mutex to prevent concurrent anonymous login attempts
  private loginAnonPromise: Promise<void> | null = null;
  private last429Error: number | null = null;
  private retryCount: number = 0;

  constructor() {
    super();
    this.config = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      powersyncUrl: import.meta.env.VITE_POWERSYNC_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
    };

    this.client = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: {
        persistSession: true
      }
    });
    this.currentSession = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) {
      return;
    }

    // Listen for auth state changes to handle automatic session refresh
    this.client.auth.onAuthStateChange((event, session) => {
      console.log('🔄 PowerSync: Auth state changed:', { event, hasSession: !!session });
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        this.updateSession(session);
      } else if (event === 'SIGNED_OUT') {
        this.updateSession(null);
      }
    });

    const sessionResponse = await this.client.auth.getSession();
    this.updateSession(sessionResponse.data.session);

    this.ready = true;
    this.iterateListeners((cb) => cb.initialized?.());
  }

  async login(username: string, password: string) {
    const {
      data: { session },
      error
    } = await this.client.auth.signInWithPassword({
      email: username,
      password: password
    });

    if (error) {
      throw error;
    }

    this.updateSession(session);
  }

  async fetchCredentials() {
    // Ensure init() has been called to load persisted session
    if (!this.ready) {
      console.log('🔄 PowerSync: Connector not initialized, initializing now...');
      await this.init();
    }

    // First, try to get session from Supabase client (which checks localStorage)
    // This is important because the session might be persisted but not yet loaded into currentSession
    if (!this.currentSession) {
      try {
        const { data: { session } } = await this.client.auth.getSession();
        if (session) {
          console.log('🔄 PowerSync: Found persisted session, using it');
          this.updateSession(session);
        }
      } catch (error) {
        console.warn('⚠️ PowerSync: Error getting persisted session:', error);
      }
    }

    let session = this.currentSession;

    if (!session) {
      console.log('🔄 PowerSync: No session found, logging in anonymously...');
      await this.loginAnon();
      session = this.currentSession;
    }

    // Check if session is expired or will expire soon (within 5 minutes)
    if (session && session.expires_at) {
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesFromNow = now + (5 * 60); // 5 minutes in seconds
      
      console.debug('🔄 PowerSync: Session check:', {
        expiresAt,
        now,
        expiresInMinutes: Math.floor((expiresAt - now) / 60),
        needsRefresh: expiresAt <= fiveMinutesFromNow
      });

      if (expiresAt <= fiveMinutesFromNow) {
        console.log('🔄 PowerSync: Session expired or expiring soon, refreshing...');
        try {
          const { data: { session: refreshedSession }, error } = await this.client.auth.refreshSession();
          if (error) {
            console.error('❌ PowerSync: Failed to refresh session:', error);
            // If refresh fails, try to login anonymously again
            await this.loginAnon();
            session = this.currentSession;
          } else {
            console.log('✅ PowerSync: Session refreshed successfully');
            this.updateSession(refreshedSession);
            session = refreshedSession;
          }
        } catch (refreshError) {
          console.error('❌ PowerSync: Error refreshing session:', refreshError);
          // If refresh fails, try to login anonymously again
          await this.loginAnon();
          session = this.currentSession;
        }
      }
    }

    if (!session) {
      throw new Error('Failed to obtain valid session');
    }

    console.debug('🔄 PowerSync: Using session token:', {
      expiresAt: session.expires_at,
      expiresInMinutes: session.expires_at ? Math.floor((session.expires_at - Math.floor(Date.now() / 1000)) / 60) : 'unknown'
    });

    return {
      endpoint: this.config.powersyncUrl,
      token: session.access_token ?? ''
    } satisfies PowerSyncCredentials;
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    console.log('🔄 PowerSync: Starting upload process to Supabase...')

    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      console.log('ℹ️ PowerSync: No pending transactions to upload')
      return;
    }

    console.log('🔄 PowerSync: Found transaction to upload:', {
      id: (transaction as any).id,
      crudCount: transaction.crud.length,
      tables: [...new Set(transaction.crud.map(op => op.table))]
    })

    let lastOp: CrudEntry | null = null;
    try {
      // Note: If transactional consistency is important, use database functions
      // or edge functions to process the entire transaction in a single call.
      for (const op of transaction.crud) {
        lastOp = op;
        console.log('🔄 PowerSync: Processing operation:', {
          table: op.table,
          operation: op.op,
          id: op.id
        })

        const table = this.client.from(op.table);
        let result: any;
        switch (op.op) {
          case UpdateType.PUT:
            const record = { ...op.opData, id: op.id };
            console.log('🔄 PowerSync: Upserting record to Supabase:', record)
            result = await table.upsert(record);
            break;
          case UpdateType.PATCH:
            console.log('🔄 PowerSync: Updating record in Supabase:', { id: op.id, data: op.opData })
            result = await table.update(op.opData).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            console.log('🔄 PowerSync: Deleting record from Supabase:', { id: op.id })
            result = await table.delete().eq('id', op.id);
            break;
        }

        if (result.error) {
          console.error('❌ PowerSync: Supabase operation failed:', result.error);
          result.error.message = `Could not update Supabase. Received error: ${result.error.message}`;
          throw result.error;
        } else {
          console.log('✅ PowerSync: Supabase operation successful:', {
            table: op.table,
            operation: op.op,
            id: op.id
          })
        }
      }

      await transaction.complete();
      console.log('✅ PowerSync: Transaction completed successfully and marked as synced')
    } catch (ex: any) {
      console.error('❌ PowerSync: Upload failed:', ex);
      if (typeof ex.code == 'string' && FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))) {
        /**
         * Instead of blocking the queue with these errors,
         * discard the (rest of the) transaction.
         *
         * Note that these errors typically indicate a bug in the application.
         * If protecting against data loss is important, save the failing records
         * elsewhere instead of discarding, and/or notify the user.
         */
        console.error('❌ PowerSync: Fatal error - discarding transaction:', lastOp, ex);
        await transaction.complete();
      } else {
        // Error may be retryable - e.g. network error or temporary server error.
        // Throwing an error here causes this call to be retried after a delay.
        console.log('🔄 PowerSync: Retryable error - will retry later:', ex.message);
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

  async loginAnon() {
    // Check if we already have a session (double-check after potential race condition)
    if (this.currentSession) {
      console.log("✅ PowerSync: Already logged in, skipping anonymous login");
      return;
    }

    // Check if there's already a login in progress (prevent concurrent signups)
    if (this.loginAnonPromise) {
      console.log("⏳ PowerSync: Anonymous login already in progress, waiting...");
      await this.loginAnonPromise;
      return;
    }

    // Check for rate limiting - if we got a 429 recently, wait before retrying
    if (this.last429Error) {
      const timeSince429 = Date.now() - this.last429Error;
      const backoffDelay = Math.min(60000, 1000 * Math.pow(2, this.retryCount)); // Exponential backoff, max 60s
      
      if (timeSince429 < backoffDelay) {
        const waitTime = backoffDelay - timeSince429;
        console.log(`⏳ PowerSync: Rate limited, waiting ${Math.ceil(waitTime / 1000)}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        // Reset after backoff period
        this.last429Error = null;
        this.retryCount = 0;
      }
    }

    // Create a promise that will be shared by concurrent callers
    this.loginAnonPromise = (async () => {
      try {
        console.log("🔄 PowerSync: Logging in anonymously...");
        
        // Double-check session one more time (might have been set by another concurrent call)
        if (this.currentSession) {
          console.log("✅ PowerSync: Session found during login, skipping signup");
          return;
        }

        const {
          data: { session },
          error
        } = await this.client.auth.signInAnonymously();

        if (error) {
          // Handle rate limiting (429 errors)
          if (error.status === 429 || error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
            this.last429Error = Date.now();
            this.retryCount++;
            console.error(`❌ PowerSync: Rate limited (429). Retry count: ${this.retryCount}`);
            throw new Error(`Rate limited: Too many anonymous signup requests. Please wait before retrying.`);
          }
          throw error;
        }

        // Reset rate limit tracking on success
        this.last429Error = null;
        this.retryCount = 0;

        this.updateSession(session);
        console.log("✅ PowerSync: Anonymous login successful");
      } catch (error) {
        console.error("❌ PowerSync: Anonymous login failed:", error);
        throw error;
      } finally {
        // Clear the promise so future calls can create a new one
        this.loginAnonPromise = null;
      }
    })();

    await this.loginAnonPromise;
  }

  async logout() {
    console.log("logging out");
    await this.client.auth.signOut();
  }

  async getSession() {
    console.log("getting session");
    const {
      data: { session: _session },
      error: _error
    } = await this.client.auth.getSession();
  }
}