/**
 * Mock Supabase Client
 * Handles data persistence for integrations and other features
 */

// In-memory database (persists for the session)
const inMemoryDb = {
  integrations: [],
};

/**
 * Mock Supabase Client
 * Provides a simple interface for database operations
 */
export const mockSupabase = {
  from: (table) => {
    return {
      /**
       * Select records from table
       */
      select: (columns = '*') => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const data = inMemoryDb[table] || [];
            resolve({ data, error: null });
          }, 200);
        });
      },

      /**
       * Insert records into table
       */
      insert: (rows) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (!inMemoryDb[table]) {
              inMemoryDb[table] = [];
            }

            const newRows = Array.isArray(rows) ? rows : [rows];
            const insertedRows = newRows.map((row) => ({
              ...row,
              id: row.id || `${table}-${Date.now()}-${Math.random()}`,
            }));

            inMemoryDb[table] = [...inMemoryDb[table], ...insertedRows];
            resolve({ data: insertedRows, error: null });
          }, 300);
        });
      },

      /**
       * Update records in table
       */
      update: (id, updates) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (!inMemoryDb[table]) {
              resolve({ 
                data: null, 
                error: 'Table does not exist' 
              });
              return;
            }
            
            let updated = null;
            inMemoryDb[table] = inMemoryDb[table].map((item) => {
              if (item.id === id) {
                updated = { ...item, ...updates };
                return updated;
              }
              return item;
            });
            
            resolve({ 
              data: updated, 
              error: updated ? null : 'Record not found' 
            });
          }, 300);
        });
      },

      /**
       * Delete records from table
       */
      delete: (id) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (!inMemoryDb[table]) {
              resolve({ 
                data: null, 
                error: 'Table does not exist' 
              });
              return;
            }
            
            const found = inMemoryDb[table].some((item) => item.id === id);
            inMemoryDb[table] = inMemoryDb[table].filter((item) => item.id !== id);
            
            resolve({ 
              data: found ? { id } : null, 
              error: found ? null : 'Record not found' 
            });
          }, 300);
        });
      },

      /**
       * Find a single record
       */
      findOne: (id) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const data = inMemoryDb[table] || [];
            const record = data.find((item) => item.id === id);
            resolve({ data: record, error: null });
          }, 200);
        });
      },

      /**
       * Query records with filters
       */
      where: (condition) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const data = inMemoryDb[table] || [];
            const filtered = data.filter((item) => {
              for (const [key, value] of Object.entries(condition)) {
                if (item[key] !== value) return false;
              }
              return true;
            });
            resolve({ data: filtered, error: null });
          }, 200);
        });
      },
    };
  },

  /**
   * Clear all data (for testing/reset)
   */
  clearAll: () => {
    for (const key in inMemoryDb) {
      inMemoryDb[key] = [];
    }
  },

  /**
   * Get raw database for debugging
   */
  getDb: () => inMemoryDb,

  /**
   * Seed data
   */
  seed: (table, data) => {
    inMemoryDb[table] = data;
  },
};

export default mockSupabase;
