import { initialDb } from '../data/initialDb.js';

const createMockSupabase = () => {
  let db = JSON.parse(JSON.stringify(initialDb));

  return {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        await new Promise(resolve => setTimeout(resolve, 800));
        if (email && password) return { data: { session: { user: { email } } }, error: null };
        return { data: null, error: { message: "Please enter an email and password." } };
      },
      signInWithOAuth: async ({ provider }) => {
         console.log(`Redirecting to ${provider} OAuth...`);
         return { data: { url: 'https://accounts.google.com/o/oauth2/auth...' }, error: null };
      },
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (callback) => {
          return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => {}
    },
    from: (table) => {
      return {
        select: () => {
          return {
            order: (col) => {
               const data = db[table] || [];
               return Promise.resolve({ data: data, error: null });
            },
            then: (resolve) => resolve({ data: db[table] || [], error: null })
          }
        },
        insert: async (rows) => {
          await new Promise(resolve => setTimeout(resolve, 300));
          if (!db[table]) db[table] = [];
          const newRows = rows.map(r => ({ ...r, id: Math.floor(Math.random() * 10000) + 100 }));
          db[table] = [...db[table], ...newRows];
          return { data: newRows, error: null };
        },
        delete: () => ({ 
          eq: async (col, val) => {
            await new Promise(resolve => setTimeout(resolve, 300));
            if (db[table]) {
              db[table] = db[table].filter(item => item[col] !== val);
            }
            return { error: null };
          } 
        }),
        update: (updates) => ({ 
          eq: async (col, val) => {
             await new Promise(resolve => setTimeout(resolve, 300));
             if (db[table]) {
               db[table] = db[table].map(item => item[col] === val ? { ...item, ...updates } : item);
             }
             return { error: null };
          } 
        })
      };
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) })
    })
  };
};

export const supabase = createMockSupabase();