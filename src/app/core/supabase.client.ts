import { createClient } from '@supabase/supabase-js';
import type { FunctionInvokeOptions } from '@supabase/supabase-js';
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

/** Invoke an edge function with a fresh user JWT in Authorization (required with publishable keys). */
export async function invokeAuthedFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  options: Omit<FunctionInvokeOptions, 'body' | 'headers'> = {}
): Promise<{ data: T | null; error: unknown }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { data: null, error: new Error('Not signed in. Please log in again.') };
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  const accessToken =
    refreshed.session?.access_token ??
    (await supabase.auth.getSession()).data.session?.access_token;

  if (refreshError || !accessToken) {
    return { data: null, error: new Error('Session expired. Please sign in again.') };
  }

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    ...options,
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return { data: data ?? null, error: error ?? null };
}

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
  must_reset_password?: boolean;
  created_by_admin?: boolean;
  exam_only?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, any>;
}
