import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, switchMap, filter, take } from 'rxjs/operators';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import {
  User,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  AuthTokens
} from '../../models';

const TOKEN_KEY   = 'ul_access_token';
const REFRESH_KEY = 'ul_refresh_token';
const USER_KEY    = 'ul_user';

/**
 * @deprecated Use AuthService from auth.service.ts (Supabase-based) instead.
 * This old API-based service is no longer actively used.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http   = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = '/api/auth'; // Placeholder; not used with Supabase

  private readonly _currentUser = signal<User | null>(this.loadUserFromStorage());
  private readonly _isLoading   = signal(false);

  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn  = computed(() => this._currentUser() !== null);
  readonly isAdmin     = computed(() => this._currentUser()?.role === 'ADMIN');
  readonly isLoading   = this._isLoading.asReadonly();

  private isRefreshing = false;
  private readonly refreshSubject = new BehaviorSubject<string | null>(null);

  login(payload: LoginRequest): Observable<LoginResponse> {
    this._isLoading.set(true);
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, payload).pipe(
      tap(res => { this.saveSession(res); this._isLoading.set(false); }),
      catchError(err => { this._isLoading.set(false); return throwError(() => err); })
    );
  }

  register(payload: RegisterRequest): Observable<LoginResponse> {
    this._isLoading.set(true);
    return this.http.post<LoginResponse>(`${this.apiUrl}/register`, payload).pipe(
      tap(res => { this.saveSession(res); this._isLoading.set(false); }),
      catchError(err => { this._isLoading.set(false); return throwError(() => err); })
    );
  }

  logout(): void {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      this.http.post(`${this.apiUrl}/logout`, { refreshToken })
        .subscribe({ error: () => {} });
    }
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  refreshAccessToken(): Observable<AuthTokens> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearSession();
      return throwError(() => new Error('No refresh token'));
    }
    return this.http.post<AuthTokens>(`${this.apiUrl}/refresh`, { refreshToken }).pipe(
      tap(tokens => {
        localStorage.setItem(TOKEN_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
        this.refreshSubject.next(tokens.accessToken);
      }),
      catchError(err => {
        this.clearSession();
        this.router.navigate(['/auth/login']);
        return throwError(() => err);
      })
    );
  }

  getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  getRefreshSubject(): BehaviorSubject<string | null> {
    return this.refreshSubject;
  }

  get isCurrentlyRefreshing(): boolean {
    return this.isRefreshing;
  }

  setRefreshing(value: boolean): void {
    this.isRefreshing = value;
  }

  private saveSession(res: LoginResponse): void {
    localStorage.setItem(TOKEN_KEY, res.tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, res.tokens.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this._currentUser.set(res.user);
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this._currentUser.set(null);
  }

  private loadUserFromStorage(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}