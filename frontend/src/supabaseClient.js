import { createClient } from '@supabase/supabase-js';

// Get Supabase configuration from environment or use defaults
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://atpsizanwfcaqmvsartw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('VITE_SUPABASE_ANON_KEY is not set. Please add it to your .env file.');
}

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
