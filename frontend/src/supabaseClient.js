import { createClient } from '@supabase/supabase-js';

// Get Supabase configuration from environment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingSupabaseConfig = !supabaseUrl || !supabaseAnonKey;

// Create a single supabase client for interacting with your database
export const supabase = missingSupabaseConfig
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase storage is not configured for this Caliber build.');
  }
  return supabase;
}
