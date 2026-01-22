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
    
    // Add calendar tables if they don't exist
    if (!this.db.calendars) {
      this.db.calendars = [
        { id: '1', user_id: '1', name: 'Personal', color: '#3b82f6', is_default: true, is_visible: true },
        { id: '2', user_id: '1', name: 'Work', color: '#10b981', is_default: false, is_visible: true },
        { id: '3', user_id: '1', name: 'AIO Booking', color: '#a855f7', is_default: false, is_visible: true }
      ];
    }
    if (!this.db.events) {
      this.db.events = [
        {
          id: '1',
          calendar_id: '1',
          title: 'Team Meeting',
          description: 'Weekly sync',
          start_time: new Date(new Date().setHours(10, 0, 0, 0)).toISOString(),
          end_time: new Date(new Date().setHours(11, 0, 0, 0)).toISOString(),
          all_day: false,
          status: 'scheduled',
          location_type: 'zoom',
          location: 'Zoom Meeting',
          meeting_url: 'https://zoom.us/j/123456789?pwd=abc123',
          meeting_id: '123456789',
          meeting_password: 'abc123'
        }
      ];
    }
    if (!this.db.booking_types) {
      this.db.booking_types = [
        {
          id: '1',
          user_id: '1',
          name: '30 Minute Meeting',
          slug: '30-min-meeting',
          description: 'Quick 30 minute consultation',
          duration_minutes: 30,
          color: '#3b82f6',
          is_active: true,
          location: 'Google Meet',
          buffer_before_minutes: 0,
          buffer_after_minutes: 0
        },
        {
          id: '2',
          user_id: '1',
          name: '1 Hour Consultation',
          slug: '1-hour-consultation',
          description: 'In-depth 1 hour consultation session',
          duration_minutes: 60,
          color: '#10b981',
          is_active: true,
          location: 'Zoom',
          buffer_before_minutes: 5,
          buffer_after_minutes: 5
        }
      ];
    }
    if (!this.db.availability_rules) {
      this.db.availability_rules = [
        // Monday - Friday, 9 AM - 5 PM
        { id: '1', user_id: '1', day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '2', user_id: '1', day_of_week: 2, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '3', user_id: '1', day_of_week: 3, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '4', user_id: '1', day_of_week: 4, start_time: '09:00', end_time: '17:00', is_available: true },
        { id: '5', user_id: '1', day_of_week: 5, start_time: '09:00', end_time: '17:00', is_available: true }
      ];
    }
    
    // Add CRM tables
    this.initializeCRMTables();
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
