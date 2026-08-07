import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, CommonModule],
  template: `
<div class="auth-page">
  <div class="auth-card">
    <div class="auth-header">
      <div class="auth-logo"><i class="fa-solid fa-book-open"></i></div>
      <h1>Connexion</h1>
      <p>Bienvenue ! Connectez-vous via Keycloak pour accéder à votre espace.</p>
    </div>
    <form (ngSubmit)="onSubmit()" class="auth-form">
      @if (error()) {
        <div class="alert alert-error">{{ error() }}</div>
      }
      <button type="submit" class="btn btn-primary" [disabled]="loading()">
        @if (loading()) { <span>Redirection...</span> }
        @else { Se connecter avec Keycloak }
      </button>
    </form>
    <p class="auth-footer">
      Pas encore de compte ? <a routerLink="/auth/register">S'inscrire</a>
    </p>
  </div>
</div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    }
    .auth-card {
      background: white; border-radius: 1rem; padding: 2.5rem;
      width: 100%; max-width: 420px; box-shadow: 0 25px 50px rgba(0,0,0,.3);
    }
    .auth-header { text-align: center; margin-bottom: 2rem; }
    .auth-logo { font-size: 3rem; margin-bottom: .5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #1e293b; margin: 0 0 .5rem; }
    p { color: #64748b; margin: 0; }
    .auth-form { display: flex; flex-direction: column; gap: 1.25rem; }
    .alert { padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; }
    .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .btn {
      padding: .75rem 1.5rem; border-radius: .5rem; font-size: .95rem;
      font-weight: 600; cursor: pointer; border: none; transition: all .2s;
    }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    .auth-footer { text-align: center; margin-top: 1.5rem; color: #64748b; font-size: .9rem; }
    .auth-footer a { color: #3b82f6; text-decoration: none; font-weight: 600; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);

  loading = signal(false);
  error = signal('');

  async onSubmit() {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login();
    } catch (e: unknown) {
      const message = (e as { error?: { message?: string } }).error?.message;
      this.error.set(message ?? 'Erreur de connexion');
    } finally {
      this.loading.set(false);
    }
  }
}
