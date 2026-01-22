/**
 * Mock Supabase Service
 * Provides Supabase-compatible API using mock data
 * Ready to swap to real Supabase with minimal changes
 * 
 * To migrate to real Supabase:
 * 1. Import real supabase client from lib/supabase.js
 * 2. Replace this implementation with actual client
 * All calling code will remain unchanged due to identical API signatures
 */

import { initialDb } from '../data/initialDb';

class MockSupabaseClient {
  constructor() {
    // Deep copy the initial database
    this.db = JSON.parse(JSON.stringify(initialDb));
    this.authSession = null;
    this.authCallbacks = [];
  }

  // ============ AUTH METHODS ============
  get auth() {
    return {
      signInWithPassword: async ({ email, password }) => {
        await new Promise(resolve => setTimeout(resolve, 800));
        if (email && password) {
          this.authSession = { user: { email }, token: 'mock-token' };
          this.notifyAuthChange('SIGNED_IN', this.authSession);
          return { data: { session: this.authSession }, error: null };
        }
        return { data: null, error: { message: "Please enter an email and password." } };
      },

      signInWithOAuth: async ({ provider }) => {
        console.log(`Redirecting to ${provider} OAuth...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.authSession = { user: { email: `${provider}-user@aio.com` }, token: 'mock-oauth-token' };
        this.notifyAuthChange('SIGNED_IN', this.authSession);
        return { data: { url: 'https://accounts.google.com/o/oauth2/auth...' }, error: null };
      },

      getSession: async () => {
        return { data: { session: this.authSession } };
      },

      onAuthStateChange: (callback) => {
        this.authCallbacks.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                this.authCallbacks = this.authCallbacks.filter(cb => cb !== callback);
              }
            }
          }
        };
      },

      signOut: async () => {
        this.authSession = null;
        this.notifyAuthChange('SIGNED_OUT', null);
        return { error: null };
      }
    };
  }

  // ============ PRIVATE HELPER ============
  notifyAuthChange(event, session) {
    this.authCallbacks.forEach(cb => cb(event, session));
  }

  // ============ TABLE QUERY BUILDER ============
  from(table) {
    return new QueryBuilder(this.db, table);
  }

  // ============ REALTIME CHANNELS ============
  channel() {
    return {
      on: () => ({
        subscribe: () => ({
          unsubscribe: () => {}
        })
      })
    };
  }
}

/**
 * Query Builder Class
 * Implements chainable query interface matching Supabase API
 */
class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.orderBy = null;
    this.limit = null;
  }

  // SELECT
  select() {
    return {
      eq: async (col, val) => {
        const data = this.db[this.table] || [];
        const filtered = data.filter(item => item[col] === val);
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: filtered, error: null };
      },
      order: (col, options = {}) => {
        return new Promise(async (resolve) => {
          await new Promise(r => setTimeout(r, 100));
          const data = this.db[this.table] || [];
          const sorted = [...data].sort((a, b) => {
            const aVal = a[col];
            const bVal = b[col];
            const ascending = options.ascending !== false;
            
            if (typeof aVal === 'string') {
              return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return ascending ? aVal - bVal : bVal - aVal;
          });
          resolve({ data: sorted, error: null });
        });
      },
      then: async (resolve) => {
        await new Promise(r => setTimeout(r, 100));
        resolve({ data: this.db[this.table] || [], error: null });
      }
    };
  }

  // INSERT
  insert(rows) {
    return new Promise(async (resolve) => {
      await new Promise(r => setTimeout(r, 300));
      if (!this.db[this.table]) this.db[this.table] = [];
      
      const newRows = rows.map(r => ({
        ...r,
        id: Math.floor(Math.random() * 10000) + 100,
        created_at: new Date().toISOString()
      }));
      
      this.db[this.table] = [...this.db[this.table], ...newRows];
      resolve({ data: newRows, error: null });
    });
  }

  // UPDATE
  update(updates) {
    return {
      eq: async (col, val) => {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (this.db[this.table]) {
          this.db[this.table] = this.db[this.table].map(item =>
            item[col] === val ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
          );
        }
        return { error: null };
      }
    };
  }

  // DELETE
  delete() {
    return {
      eq: async (col, val) => {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (this.db[this.table]) {
          this.db[this.table] = this.db[this.table].filter(item => item[col] !== val);
        }
        return { error: null };
      }
    };
  }
}

// Create and export singleton instance
export const mockSupabase = new MockSupabaseClient();

// Named export for flexibility
export const createMockSupabase = () => new MockSupabaseClient();

// Default export
export default mockSupabase;
