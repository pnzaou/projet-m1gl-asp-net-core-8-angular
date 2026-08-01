import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthResponse, User } from '../../shared/models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _currentUser = signal<User | null>(this.loadUser());
  currentUser = this._currentUser.asReadonly();
  isLoggedIn = computed(() => !!this._currentUser());
  isAdmin = computed(() => ['Admin', 'SuperAdmin'].includes(this._currentUser()?.role ?? ''));
  isSuperAdmin = computed(() => this._currentUser()?.role === 'SuperAdmin');

  private readonly API = `${environment.apiUrl}/auth`;
  private readonly kcTokenEndpoint = `${environment.keycloak.issuer.replace(/\/$/, '')}/protocol/openid-connect/token`;
  private readonly keycloakStateKey = 'keycloak_state';
  private readonly keycloakVerifierKey = 'keycloak_code_verifier';
  private readonly keycloakRedirectUri = `${window.location.origin}/auth/login`;

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.API}/login`, { email, password })
      .pipe(tap(res => this.storeSession(res)));
  }

  register(data: { firstName: string; lastName: string; email: string; password: string }) {
    return this.http.post<AuthResponse>(`${this.API}/register`, data)
      .pipe(tap(res => this.storeSession(res)));
  }

  async loginWithKeycloak() {
    const authUrl = `${environment.keycloak.issuer.replace(/\/$/, '')}/protocol/openid-connect/auth`;
    const state = crypto.randomUUID();
    const codeVerifier = this.randomBase64Url(32);
    const codeChallenge = await this.createCodeChallenge(codeVerifier);

    sessionStorage.setItem(this.keycloakStateKey, state);
    sessionStorage.setItem(this.keycloakVerifierKey, codeVerifier);

    const params = new URLSearchParams({
      client_id: environment.keycloak.clientId,
      redirect_uri: this.keycloakRedirectUri,
      response_type: 'code',
      scope: environment.keycloak.scope,
      state,
      nonce: crypto.randomUUID(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    window.location.href = `${authUrl}?${params.toString()}`;
  }

  refresh() {
    const rt = localStorage.getItem('refresh_token');
    return this.http.post<AuthResponse>(`${this.API}/refresh`, { refreshToken: rt })
      .pipe(tap(res => this.storeSession(res)));
  }

  logout() {
    const rt = localStorage.getItem('refresh_token');
    if (rt) {
      this.http.post(`${this.API}/logout`, { refreshToken: rt }).subscribe();
    }
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  updateLocalUser(user: User) {
    localStorage.setItem('current_user', JSON.stringify(user));
    this._currentUser.set(user);
  }

  handleKeycloakCallbackIfNeeded(): Promise<void> {
    const search = new URLSearchParams(window.location.search);
    const code = search.get('code');
    const state = search.get('state');

    if (!code || !state) {
      return Promise.resolve();
    }

    const storedState = sessionStorage.getItem(this.keycloakStateKey);
    const codeVerifier = sessionStorage.getItem(this.keycloakVerifierKey);

    if (!storedState || state !== storedState || !codeVerifier) {
      this.clearSession();
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.exchangeCodeForToken(code, codeVerifier).subscribe({
        next: tokenRes => {
          const user = this.buildKeycloakUser(tokenRes.access_token);
          this.storeSession({
            accessToken: tokenRes.access_token,
            refreshToken: tokenRes.refresh_token,
            user
          });

          sessionStorage.removeItem(this.keycloakStateKey);
          sessionStorage.removeItem(this.keycloakVerifierKey);
          window.history.replaceState({}, document.title, window.location.pathname);
          this.router.navigate(['/dashboard'], { replaceUrl: true });
          resolve();
        },
        error: () => {
          sessionStorage.removeItem(this.keycloakStateKey);
          sessionStorage.removeItem(this.keycloakVerifierKey);
          this.router.navigate(['/auth/login']);
          resolve();
        }
      });
    });
  }

  private exchangeCodeForToken(code: string, codeVerifier: string) {
    const body = new HttpParams()
      .set('grant_type', 'authorization_code')
      .set('client_id', environment.keycloak.clientId)
      .set('code', code)
      .set('redirect_uri', this.keycloakRedirectUri)
      .set('code_verifier', codeVerifier);

    return this.http.post<{ access_token: string; refresh_token: string; id_token: string; }>(
      this.kcTokenEndpoint,
      body.toString(),
      {
        headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' })
      }
    );
  }

  private buildKeycloakUser(accessToken: string): User {
    const payload = this.decodeJwtPayload(accessToken);
    const email = payload.email ?? payload.preferred_username ?? 'keycloak-user@local';
    const fullName = payload.name ?? payload.preferred_username ?? email;
    const [firstName = '', ...rest] = fullName.split(' ');
    const lastName = rest.join(' ') || 'User';
    const roles = payload.realm_access?.roles ?? [];
    const role = roles.includes('SuperAdmin') ? 'SuperAdmin' : roles.includes('Admin') ? 'Admin' : 'User';

    return {
      id: payload.sub ?? crypto.randomUUID(),
      firstName,
      lastName,
      email,
      role,
      isActive: true,
      createdAt: new Date().toISOString()
    };
  }

  private decodeJwtPayload(token: string) {
    const parts = token.split('.');
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    return JSON.parse(atob(padded));
  }

  private createCodeChallenge(verifier: string) {
    const encoder = new TextEncoder();
    return crypto.subtle.digest('SHA-256', encoder.encode(verifier)).then(buffer => {
      const bytes = new Uint8Array(buffer);
      return this.base64UrlEncode(bytes);
    });
  }

  private randomBase64Url(bytesLength: number) {
    const bytes = new Uint8Array(bytesLength);
    crypto.getRandomValues(bytes);
    return this.base64UrlEncode(bytes);
  }

  private base64UrlEncode(bytes: Uint8Array) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private storeSession(res: AuthResponse) {
    localStorage.setItem('access_token', res.accessToken);
    localStorage.setItem('refresh_token', res.refreshToken);
    localStorage.setItem('current_user', JSON.stringify(res.user));
    this._currentUser.set(res.user);
  }

  private clearSession() {
    ['access_token', 'refresh_token', 'current_user'].forEach(k => localStorage.removeItem(k));
    this._currentUser.set(null);
  }

  private loadUser(): User | null {
    const raw = localStorage.getItem('current_user');
    return raw ? JSON.parse(raw) : null;
  }
}
