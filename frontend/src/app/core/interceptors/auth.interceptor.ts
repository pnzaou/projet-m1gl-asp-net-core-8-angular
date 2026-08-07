import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { KeycloakService } from 'keycloak-angular';
import { Observable, from, switchMap } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly keycloak: KeycloakService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const url = new URL(req.url, window.location.origin);
    const isApiRequest = url.pathname.startsWith('/api');

    if (!isApiRequest) {
      return next.handle(req);
    }

    return from(this.keycloak.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          return next.handle(req);
        }

        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });

        return next.handle(authReq);
      })
    );
  }
}
