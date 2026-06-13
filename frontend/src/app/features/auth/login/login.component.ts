import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CommonModule],
  template: `
<div class="auth-page">
  <div class="auth-card">
    <div class="auth-header">
      <div class="auth-logo">👤</div>
      <h1>Connexion</h1>
      <p>Bienvenue ! Connectez-vous à votre compte.</p>
    </div>
    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="auth-form">
      @if (error()) {
        <div class="alert alert-error">{{ error() }}</div>
      }
      <div class="form-group">
        <label>Email</label>
        <input type="email" formControlName="email" placeholder="vous@exemple.com"
          [class.invalid]="isInvalid('email')" />
        @if (isInvalid('email')) {
          <span class="field-error">Email invalide</span>
        }
      </div>
      <div class="form-group">
        <label>Mot de passe</label>
        <div class="input-with-toggle">
          <input [type]="showPwd() ? 'text' : 'password'" formControlName="password"
            placeholder="••••••••" [class.invalid]="isInvalid('password')" />
          <button type="button" class="pwd-toggle" (click)="showPwd.set(!showPwd())">
            {{ showPwd() ? '🙈' : '👁' }}
          </button>
        </div>
        @if (isInvalid('password')) {
          <span class="field-error">Mot de passe requis (min. 6 caractères)</span>
        }
      </div>
      <button type="submit" class="btn btn-primary" [disabled]="loading()">
        @if (loading()) { <span>Connexion...</span> }
        @else { Se connecter }
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
    .form-group { display: flex; flex-direction: column; gap: .4rem; }
    label { font-size: .875rem; font-weight: 600; color: #374151; }
    input {
      padding: .65rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem;
      font-size: .95rem; outline: none; transition: border .2s; width: 100%; box-sizing: border-box;
    }
    input:focus { border-color: #3b82f6; }
    input.invalid { border-color: #ef4444; }
    .input-with-toggle { position: relative; }
    .input-with-toggle input { padding-right: 3rem; }
    .pwd-toggle {
      position: absolute; right: .75rem; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; font-size: 1.1rem;
    }
    .field-error { color: #ef4444; font-size: .8rem; }
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
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal('');
  showPwd = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  isInvalid(field: string) {
    const c = this.form.get(field)!;
    return c.invalid && (c.dirty || c.touched);
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.value;
    this.auth.login(email!, password!).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (e) => {
        this.error.set(e.error?.message ?? 'Erreur de connexion');
        this.loading.set(false);
      }
    });
  }
}
