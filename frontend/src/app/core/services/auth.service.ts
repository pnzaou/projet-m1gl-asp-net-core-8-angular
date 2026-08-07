import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { KeycloakEventType, KeycloakService } from 'keycloak-angular';
import { tap } from 'rxjs';
import { User } from '../../shared/models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private keycloak = inject(KeycloakService);
  private http = inject(HttpClient);

  private _authenticated = signal(this.keycloak.isLoggedIn());
  private _roles = signal<string[]>(this.keycloak.getUserRoles(true));
  private _currentUser = signal<User | null>(null);

  isLoggedIn = this._authenticated.asReadonly();
  currentUser = this._currentUser.asReadonly();
  isAdmin = computed(() => this._roles().some(r => ['Admin', 'SuperAdmin'].includes(r)));
  isSuperAdmin = computed(() => this._roles().includes('SuperAdmin'));

  private readonly API = `${environment.apiUrl}/users`;

  constructor() {
    // KeycloakService lives for the app's lifetime (providedIn: 'root'),
    // so this subscription never needs to be torn down.
    this.keycloak.keycloakEvents$.subscribe(event => {
      if (
        event.type === KeycloakEventType.OnAuthSuccess ||
        event.type === KeycloakEventType.OnAuthRefreshSuccess ||
        event.type === KeycloakEventType.OnReady
      ) {
        this._authenticated.set(this.keycloak.isLoggedIn());
        this._roles.set(this.keycloak.getUserRoles(true));
        if (this._authenticated() && !this._currentUser()) {
          this.loadProfile().subscribe();
        }
      }

      if (event.type === KeycloakEventType.OnAuthLogout) {
        this._authenticated.set(false);
        this._roles.set([]);
        this._currentUser.set(null);
      }
    });
  }

  login() {
    return this.keycloak.login({ redirectUri: window.location.origin + '/dashboard' });
  }

  logout() {
    return this.keycloak.logout(window.location.origin);
  }

  loadProfile() {
    return this.http.get<User>(`${this.API}/me`).pipe(tap(user => this._currentUser.set(user)));
  }

  updateLocalUser(user: User) {
    this._currentUser.set(user);
  }

  accountUrl(): string {
    const instance = this.keycloak.getKeycloakInstance();
    return `${instance.authServerUrl}realms/${instance.realm}/account`;
  }
}
