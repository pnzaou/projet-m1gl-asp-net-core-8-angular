import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { KeycloakAuthGuard, KeycloakService } from 'keycloak-angular';

@Injectable({ providedIn: 'root' })
export class AuthGuard extends KeycloakAuthGuard {
  constructor(router: Router, keycloakAngular: KeycloakService) {
    super(router, keycloakAngular);
  }

  async isAccessAllowed(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean | UrlTree> {
    if (!this.authenticated) {
      await this.keycloakAngular.login({ redirectUri: window.location.origin + state.url });
      return false;
    }

    const requiredRoles = route.data['roles'] as string[] | undefined;
    if (requiredRoles?.length) {
      const allowed = requiredRoles.some(r => this.roles.includes(r));
      return allowed ? true : this.router.parseUrl('/dashboard');
    }

    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class GuestGuard extends KeycloakAuthGuard {
  constructor(router: Router, keycloakAngular: KeycloakService) {
    super(router, keycloakAngular);
  }

  async isAccessAllowed(): Promise<boolean | UrlTree> {
    return this.authenticated ? this.router.parseUrl('/dashboard') : true;
  }
}
