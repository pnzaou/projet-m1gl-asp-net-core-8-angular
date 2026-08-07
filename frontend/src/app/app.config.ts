import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { KeycloakAngularModule, KeycloakBearerInterceptor, KeycloakService } from 'keycloak-angular';
import { routes } from './app.routes';
import { environment } from '../environments/environment';

function initializeKeycloak(keycloak: KeycloakService) {
  return () =>
    keycloak.init({
      config: {
        url: environment.keycloakUrl,
        realm: 'usermgmt',
        clientId: 'usermgmt-frontend'
      },
      initOptions: {
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        silentCheckSsoRedirectUri: window.location.origin + '/assets/silent-check-sso.html'
      },
      bearerExcludedUrls: ['/auth/']
    });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // withInterceptorsFromDi() is required — without it, provideHttpClient()
    // silently ignores classic HTTP_INTERCEPTORS-registered interceptors
    // like KeycloakBearerInterceptor below.
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(KeycloakAngularModule),
    { provide: HTTP_INTERCEPTORS, useClass: KeycloakBearerInterceptor, multi: true },
    { provide: APP_INITIALIZER, useFactory: initializeKeycloak, multi: true, deps: [KeycloakService] }
  ]
};
