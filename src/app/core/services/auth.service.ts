import {
  Injectable,
  signal,
  computed,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import { invokeAuthedFunction, supabase, type UserProfile, type AuthUser } from '../supabase.client';
import { FunctionsHttpError, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { ToastService } from './toast';

export type SignOutReason = 'manual' | 'remote' | 'timeout';

const AUTH_SIGN_IN_TIMEOUT_MS = 25_000;
const AUTH_PROFILE_LOAD_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), ms);
    })
  ]);
}

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
  private readonly sessionInitPromise: Promise<void>;

  currentUser = computed(() => this.currentUserSignal());
  profile = computed(() => this.profileSignal());
  isLoading = computed(() => this.isLoadingSignal());
  isLoggedIn = computed(() => this.isAuthenticatedSignal());
  profileCompleted = computed(() => this.profileSignal()?.profile_completed ?? false);

  private static readonly PROTECTED_PREFIXES = ['/my-courses', '/profile', '/admin', '/s/join', '/exam'];

  constructor() {
    this.sessionInitPromise = this.initializeAuth();
  }

  /** Wait for session restore, then return whether user is authenticated. */
  async ensureSessionChecked(): Promise<boolean> {
    await this.sessionInitPromise;
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      this.applySession(session.user);
      return true;
    }

    this.clearAuthState();
    return false;
  }

  private async initializeAuth(): Promise<void> {
    await this.restoreSession();

    supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        this.applySession(session.user);
        await this.ensureProfile(session.user);
        await this.loadProfile(session.user.id);
        return;
      }

      const wasRemoteSignOut = event === 'SIGNED_OUT' && !this.isSigningOut;
      this.clearAuthState();

      if (wasRemoteSignOut) {
        this.toast.info('You were signed in on another device. Please sign in again.');
        const loginPath = this.router.url.startsWith('/exam') ? '/exam/login' : '/auth/login';
        await this.router.navigateByUrl(loginPath, { replaceUrl: true });
        return;
      }

      if (event === 'SIGNED_OUT' && this.isProtectedUrl(this.router.url)) {
        const loginPath = this.router.url.startsWith('/exam') ? '/exam/login' : '/auth/login';
        await this.router.navigateByUrl(loginPath, { replaceUrl: true });
      }
    });
  }

  private applySession(user: Session['user']): void {
    this.currentUserSignal.set({
      id: user.id,
      email: user.email || '',
      user_metadata: user.user_metadata
    });
    this.isAuthenticatedSignal.set(true);
  }

  private clearAuthState(): void {
    this.currentUserSignal.set(null);
    this.profileSignal.set(null);
    this.isAuthenticatedSignal.set(false);
  }

  private isProtectedUrl(url: string): boolean {
    const path = url.split('?')[0];
    return AuthService.PROTECTED_PREFIXES.some(prefix =>
      path === prefix || path.startsWith(`${prefix}/`)
    );
  }

  private async restoreSession(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      this.applySession(session.user);
      await this.ensureProfile(session.user);
      await this.loadProfile(session.user.id);
    }
  }

  async requestSignupOtp(email: string): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        'send-signup-otp',
        { body: { email: email.trim().toLowerCase() } }
      );
      if (error) {
        this.toast.error(await this.readFunctionError(error));
        return false;
      }
      if (data?.error) {
        this.toast.error(data.error);
        return false;
      }
      this.toast.success('Verification code sent. Check your inbox.');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not send verification code';
      this.toast.error(message);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async verifySignupOtp(email: string, code: string): Promise<string | null> {
    try {
      this.isLoadingSignal.set(true);
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        verificationToken?: string;
        error?: string;
      }>('verify-signup-otp', {
        body: { email: email.trim().toLowerCase(), code: code.trim() }
      });
      if (error) {
        this.toast.error(await this.readFunctionError(error));
        return null;
      }
      if (data?.error || !data?.verificationToken) {
        this.toast.error(data?.error ?? 'Could not verify that code');
        return null;
      }
      this.toast.success('Email verified. You can create your account.');
      return data.verificationToken;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not verify that code';
      this.toast.error(message);
      return null;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async signUp(
    email: string,
    password: string,
    fullName: string,
    phoneNumber: string | undefined,
    verificationToken: string
  ): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);

      if (!verificationToken) {
        this.toast.error('Verify your email before creating an account.');
        return false;
      }

      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        'complete-signup',
        {
          body: {
            email: email.trim().toLowerCase(),
            password,
            fullName: fullName.trim(),
            phone: phoneNumber?.trim() ?? '',
            verificationToken
          }
        }
      );

      if (error) {
        this.toast.error(await this.readFunctionError(error));
        return false;
      }
      if (data?.error || !data?.success) {
        this.toast.error(data?.error ?? 'Failed to create account');
        return false;
      }

      const signedIn = await this.signIn(email.trim().toLowerCase(), password, { silent: true });
      if (!signedIn) {
        this.toast.success('Account created. Sign in with your email and password.');
        return false;
      }

      this.toast.success('Account created! Please complete your profile.');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      this.toast.error(message);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async resetOwnAdminPassword(): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);
      const { data, error } = await invokeAuthedFunction<{
        success?: boolean;
        emailSent?: boolean;
        error?: string;
      }>('admin-reset-password', {});

      if (error) {
        this.toast.error(await this.readFunctionError(error));
        return false;
      }
      if (data?.error || !data?.success) {
        this.toast.error(data?.error ?? 'Could not reset password');
        return false;
      }

      this.toast.success('Temporary password sent. Sign in with it, then choose a new password.');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not reset password';
      this.toast.error(message);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  private async readFunctionError(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string; message?: string };
        if (body?.error) return String(body.error);
        if (body?.message) return String(body.message);
      } catch {
        /* response body already consumed or not JSON */
      }
    }
    return error instanceof Error ? error.message : 'Request failed';
  }

  async signIn(
    email: string,
    password: string,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);

      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password
        }),
        AUTH_SIGN_IN_TIMEOUT_MS,
        'Sign-in timed out. Supabase Auth may still be recovering after the upgrade—wait 1–2 minutes, refresh, and try again.'
      );

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

        try {
          await withTimeout(
            (async () => {
              await this.ensureProfile(data.user);
              await this.loadProfile(data.user.id);
            })(),
            AUTH_PROFILE_LOAD_TIMEOUT_MS,
            'Profile load timed out'
          );
        } catch {
          this.toast.warning(
            'Signed in, but loading your profile is slow. If pages fail to open, wait for Supabase to show Healthy and refresh.'
          );
        }

        void supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
        if (!options?.silent) {
          this.toast.success('Welcome back!');
        }
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

  async signOut(redirectTo = '/auth/login', reason: SignOutReason = 'manual'): Promise<boolean> {
    if (this.isSigningOut) return false;
    this.isSigningOut = true;

    this.clearAuthState();

    try {
      await supabase.auth.signOut({ scope: 'local' });

      if (reason === 'manual') {
        void supabase.auth.signOut({ scope: 'global' }).catch(() => { });
        this.toast.success('Logged out successfully');
      } else if (reason === 'timeout') {
        this.toast.info('Your session expired after 30 minutes of inactivity.');
      }

      await this.router.navigateByUrl(redirectTo, { replaceUrl: true });
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sign out failed';
      this.toast.error(message);
      await this.router.navigateByUrl(redirectTo, { replaceUrl: true });
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

  private async ensureProfile(user: Session['user']): Promise<void> {
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (existing) return;

      const meta = user.user_metadata ?? {};
      const role = meta['role'] === 'ADMIN' ? 'ADMIN' : 'USER';
      const fullName =
        (typeof meta['full_name'] === 'string' && meta['full_name'].trim()) ||
        user.email?.split('@')[0] ||
        'User';

      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          full_name: fullName,
          email: user.email ?? null,
          phone: (meta['phone_number'] as string | undefined) ?? null,
          role,
          profile_completed: false,
          must_reset_password: Boolean(meta['must_reset_password']),
          created_by_admin: Boolean(meta['created_by_admin'])
        },
        { onConflict: 'id' }
      );

      if (error) {
        console.error('ensureProfile:', error);
      }
    } catch (error) {
      console.error('ensureProfile:', error);
    }
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
        const authEmail = this.currentUserSignal()?.email?.trim().toLowerCase();
        let profile = data as UserProfile;
        if (authEmail && !profile.email) {
          await supabase.from('profiles').update({ email: authEmail }).eq('id', userId);
          profile = { ...profile, email: authEmail };
        }
        this.profileSignal.set(profile);
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

  mustResetPassword(): boolean {
    const profile = this.profileSignal();
    if (profile?.must_reset_password) return true;
    const meta = this.currentUserSignal()?.user_metadata?.['must_reset_password'];
    return meta === true;
  }

  isExamOnly(): boolean {
    if (this.isAdmin()) return false;
    const profile = this.profileSignal();
    if (profile?.exam_only) return true;
    return this.currentUserSignal()?.user_metadata?.['exam_only'] === true;
  }

  postLoginRedirectUrl(): string {
    if (this.isExamOnly()) return '/exam/dashboard';
    if (this.mustResetPassword()) return '/auth/set-password';
    if (!this.hasCompletedProfile()) return '/auth/complete-profile';
    return '/';
  }

  postPasswordResetRedirectUrl(): string {
    if (this.isAdmin()) return '/admin/dashboard';
    if (this.isExamOnly()) return '/exam/dashboard';
    if (!this.hasCompletedProfile()) return '/auth/complete-profile';
    return '/';
  }

  async setNewPassword(password: string): Promise<boolean> {
    try {
      this.isLoadingSignal.set(true);

      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) {
        this.toast.error(pwErr.message);
        return false;
      }

      const userId = this.currentUserSignal()?.id;
      if (userId) {
        await supabase
          .from('profiles')
          .update({ must_reset_password: false })
          .eq('id', userId);
        await this.updateAuthMetadata({ must_reset_password: false });
        await this.loadProfile(userId);
      }

      this.toast.success('Password updated successfully');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not update password';
      this.toast.error(message);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async logout(): Promise<boolean> {
    return this.signOut();
  }

  isAdmin(): boolean {
    const user = this.currentUser();
    const metaRole = user?.user_metadata?.['role'];
    const profileRole = (this.profileSignal() as UserProfile & { role?: string })?.role;
    return metaRole === 'ADMIN' || profileRole === 'ADMIN';
  }
}