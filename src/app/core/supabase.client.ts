import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

const supabaseUrl = environment.supabaseUrl;
const supabaseKey = environment.supabaseAnonKey;

// Create and export Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// TypeScript types for database
export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  college_name: string | null;
  degree: string | null;
  specialization: string | null;
  current_year: number | null;
  graduation_year: number | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  bio: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  profile_completed: boolean;
  role?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, any>;
}
