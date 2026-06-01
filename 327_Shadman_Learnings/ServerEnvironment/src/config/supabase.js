import { createClient } from '@supabase/supabase-js';
import env from './env.js';

/**
 * Supabase client with service role key.
 * Used for server-side operations that need full access (bypasses RLS).
 */
export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Supabase client with anon key.
 * Used for operations that should respect Row Level Security.
 */
export const supabasePublic = createClient(env.supabase.url, env.supabase.anonKey);

export default supabase;
