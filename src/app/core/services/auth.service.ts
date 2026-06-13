import {
  Injectable,
  signal,
  computed,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import { supabase, type UserProfile, type AuthUser } from '../supabase.client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { ToastService } from './toast';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private currentUserSignal = signal<AuthUser | null>(null);
  private isSigningOut = false;
  private profileSignal = signal<UserProfile | null>(null);
  private isLoadingSignal = signal(false);
  private isAuthenticatedSignal = signal(false);

  currentUser = computed(() => this.currentUserSignal());
  profile = computed(() => this.profileSignal());
  isLoading = computed(() => this.isLoadingSignal());
  isLoggedIn = computed(() => this.isAuthenticatedSignal());
  profileCompleted = computed(() => this.profileSignal()?.profile_completed ?? false);

  constructor() {
    this.initializeAuth();
  }

  private initializeAuth(): void {
    void this.restoreSession();

    supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        this.currentUserSignal.set({
          id: session.user.id,
          email: session.user.email || '',
          user_metadata: session.user.user_metadata
        });
        this.isAuthenticatedSignal.set(true);
        await this.loadProfile(session.user.id);
      } else {
        this.currentUserSignal.set(null);
        this.profileSignal.set(null);
        this.isAuthenticatedSignal.set(false);
      }
    });
  }

  private async restoreSession(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      this.currentUserSignal.set({
        id: session.user.id,
        email: session.user.email || '',
        user_metadata: session.user.user_metadata
      });
      this.isAuthenticatedSignal.set(true);
      await this.loadProfile(session.user.id);
    }
  }

  async signUp(email: string, password: string, fullName: string): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (authError) {
        this.toast.error(authError.message);
        return false;
      }

      if (!authData.user) {
        this.toast.error('Failed to create account');
        return false;
      }

      if (!authData.session) {
        this.toast.success('Account created! Check your email and click the confirmation link to activate your account.');
        return true; // ← changed: true lets the caller navigate to /auth/check-email
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          {
            id: authData.user.id,
            full_name: fullName,
            profile_completed: false
          }
        ]);

      if (profileError) {
        this.toast.error('Failed to create profile');
        return false;
      }

      this.toast.success('Account created! Please complete your profile.');
      return true;
    } catch (error: any) {
      this.toast.error(error.message || 'Sign up failed');
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async signIn(email: string, password: string): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        // ← changed: human-friendly message for unconfirmed email
        if (error.message.toLowerCase().includes('email not confirmed')) {
          this.toast.error('Please confirm your email before signing in. Check your inbox.');
        } else {
          this.toast.error(error.message);
        }
        return false;
      }

      if (data.user) {
        this.currentUserSignal.set({
          id: data.user.id,
          email: data.user.email || '',
          user_metadata: data.user.user_metadata
        });
        this.isAuthenticatedSignal.set(true);
        await this.loadProfile(data.user.id);
        this.toast.success('Welcome back!');
        return true;
      }

      return false;
    } catch (error: any) {
      this.toast.error(error.message || 'Sign in failed');
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async signOut(): Promise<boolean> {
    if (this.isSigningOut) return false;
    this.isSigningOut = true;

    try {
      this.isLoadingSignal.set(true);

      const { error } = await supabase.auth.signOut({ scope: 'global' });

      if (error) {
        await supabase.auth.signOut({ scope: 'local' });
      }

      this.currentUserSignal.set(null);
      this.profileSignal.set(null);
      this.isAuthenticatedSignal.set(false);

      this.toast.success('Logged out successfully');
      await this.router.navigateByUrl('/auth/login');
      return true;
    } catch (error: unknown) {
      this.currentUserSignal.set(null);
      this.profileSignal.set(null);
      this.isAuthenticatedSignal.set(false);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

      const message = error instanceof Error ? error.message : 'Sign out failed';
      this.toast.error(message);
      await this.router.navigateByUrl('/auth/login');
      return false;
    } finally {
      this.isLoadingSignal.set(false);
      this.isSigningOut = false;
    }
  }

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email || '',
      user_metadata: user.user_metadata
    };
  }

  private async loadProfile(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select()
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      if (data) {
        this.profileSignal.set(data);
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select()
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        return null;
      }

      return data;
    } catch (error: any) {
      return null;
    }
  }

  async createProfile(userId: string, profile: Partial<UserProfile>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .insert([
          {
            id: userId,
            ...profile,
            profile_completed: false
          }
        ]);

      if (error) {
        this.toast.error(error.message);
        return false;
      }

      this.toast.success('Profile created');
      return true;
    } catch (error: any) {
      this.toast.error(error.message || 'Failed to create profile');
      return false;
    }
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);

      const { id: _id, created_at: _created, ...safeUpdates } = updates as UserProfile;

      const payload = {
        id: userId,
        ...safeUpdates,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.error('Profile save error:', error);
        this.toast.error(error.message || 'Failed to save profile');
        return false;
      }

      await this.loadProfile(userId);
      this.toast.success('Profile saved successfully');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      console.error('Profile save error:', error);
      this.toast.error(message);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async updateAuthMetadata(updates: Record<string, any>): Promise<boolean> {
    try {
      const { error } = await supabase.auth.updateUser({
        data: updates
      });

      if (error) {
        this.toast.error(error.message);
        return false;
      }

      return true;
    } catch (error: any) {
      this.toast.error(error.message || 'Failed to update metadata');
      return false;
    }
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSignal();
  }

  hasCompletedProfile(): boolean {
    return this.profileSignal()?.profile_completed ?? false;
  }

  async logout(): Promise<boolean> {
    return this.signOut();
  }

  isAdmin(): boolean {
    const user = this.currentUser();
    const metaRole = (user?.user_metadata as any)?.role;
    return metaRole === 'ADMIN';
  }
}