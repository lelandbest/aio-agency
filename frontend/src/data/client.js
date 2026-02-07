// Canonical data client entrypoint (single source of truth)
// Today: mockSupabase. Later: swap to real Supabase without touching modules.

import mockSupabase from '../services/mockSupabase';

export const client = mockSupabase;
export default client;
