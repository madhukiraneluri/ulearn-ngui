# ULearn — Project Summary (Concise)

Overview
- ULearn is an Angular 21 (standalone components, OnPush) frontend for an LMS.
- Backend: Supabase (Auth, PostgreSQL, Storage, RLS). No separate API server.

Key Tech
- Angular 21.2.x, Signals, NgRx for global auth state
- SCSS-only styling; strict design tokens in styles/variables.scss
- @supabase/supabase-js for all DB/auth/storage operations

Angular Conventions (short)
- All components: `standalone: true`, `ChangeDetectionStrategy.OnPush`.
- Use `inject()` for DI (no constructors), use `signal()/computed()/effect()`.
- Use `input()` / `output()` signals instead of `@Input()` / `@Output()`.
- Use `loadComponent()` for lazy routes; no NgModules.
- No `any` types; import interfaces from `src/app/models/index.ts`.

Supabase Setup (essentials)
- Install: `npm install @supabase/supabase-js`
- Add env keys in `src/environments/environment*.ts`:
  - `supabaseUrl`, `supabaseAnonKey`
- Create `src/app/core/services/supabase.service.ts` exposing a `client` via `createClient`.
- Create DB tables and RLS policies as needed; public buckets for thumbnails/papers.

AuthService pattern (minimal)
```ts
@Injectable({providedIn:'root'})
export class AuthService {
  private supabase = inject(SupabaseService).client;
  private _currentUser = signal<User|null>(null);
  readonly currentUser = this._currentUser.asReadonly();

  async init() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) await this.loadProfile(session.user.id);
    this.supabase.auth.onAuthStateChange(async (_e, s) => { if (s?.user) await this.loadProfile(s.user.id); else this._currentUser.set(null); });
  }

  private async loadProfile(userId: string) {
    const { data } = await this.supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) this._currentUser.set(data as User);
  }
}
```

Public services pattern
- Use `from(this.supabase.from(...).select(...))` + `map(({data,error})=>...)` for observables
- Admin services may use async/await and return plain promises.

Files & Next Steps
- `src/app/core/services/supabase.service.ts` — ensure created
- `src/app/core/services/auth.service.ts` — update to Supabase pattern (see above)
- Migrate mock services (`course.service.ts`, `paper.service.ts`, etc.) to use Supabase queries

Notes
- Keep `CLAUDE.md` short; this file is a concise reference for quick onboarding.
- If you want the full original verbose spec saved, I can store it separately (split files or compressed).

Last updated: concise summary created to stay within file-size limits.
