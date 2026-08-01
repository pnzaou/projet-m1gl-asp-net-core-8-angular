import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
<div class="auth-page">
  <div class="auth-card">
    <div class="auth-header">
      <div class="auth-logo"><i class="fa-solid fa-book-open"></i></div>
      <h1>Redirection</h1>
      <p>Vous allez être redirigé vers Keycloak pour vous authentifier.</p>
    </div>
  </div>
</div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    }

    .auth-card {
      background: white;
      border-radius: 1rem;
      padding: 2.5rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 25px 50px rgba(0, 0, 0, .3);
    }

    .auth-header {
      text-align: center;
    }

    .auth-logo {
      font-size: 3rem;
      margin-bottom: .75rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 .5rem;
    }

    p {
      color: #64748b;
      margin: 0;
    }
  `]
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    const search = new URLSearchParams(window.location.search);

    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    if (search.has('code') || search.has('state')) {
      await this.auth.handleKeycloakCallbackIfNeeded();
      if (this.auth.isLoggedIn()) {
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      }
      return;
    }

    this.auth.loginWithKeycloak();
  }
}
