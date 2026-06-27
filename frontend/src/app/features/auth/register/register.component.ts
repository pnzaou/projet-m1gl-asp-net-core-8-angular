import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

function passwordMatch(control: AbstractControl) {
  const pw = control.get('password')?.value;
  const cpw = control.get('confirmPassword')?.value;
  return pw === cpw ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CommonModule],
  template: `
<div class="auth-page">
  <div class="auth-card">
    <div class="auth-header">
      <div class="auth-logo"><i class="fa-solid fa-book-open"></i></div>
      <h1>Créer un compte</h1>
    </div>
    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="auth-form">
      @if (error()) { <div class="alert alert-error">{{ error() }}</div> }
      <div class="form-row">
        <div class="form-group">
          <label>Prénom</label>
          <input formControlName="firstName" placeholder="Jean" [class.invalid]="isInvalid('firstName')" />
        </div>
        <div class="form-group">
          <label>Nom</label>
          <input formControlName="lastName" placeholder="Dupont" [class.invalid]="isInvalid('lastName')" />
        </div>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" formControlName="email" placeholder="vous@exemple.com"
          [class.invalid]="isInvalid('email')" />
      </div>
      <div class="form-group">
        <label>Mot de passe</label>
        <input type="password" formControlName="password" placeholder="Min. 8 caractères"
          [class.invalid]="isInvalid('password')" />
        @if (isInvalid('password')) {
          <span class="field-error">Minimum 8 caractères</span>
        }
      </div>
      <div class="form-group">
        <label>Confirmer le mot de passe</label>
        <input type="password" formControlName="confirmPassword" placeholder="••••••••"
          [class.invalid]="form.hasError('mismatch') && form.get('confirmPassword')?.touched" />
        @if (form.hasError('mismatch') && form.get('confirmPassword')?.touched) {
          <span class="field-error">Les mots de passe ne correspondent pas</span>
        }
      </div>
      <button type="submit" class="btn btn-primary" [disabled]="loading()">
        @if (loading()) { Création en cours... } @else { Créer mon compte }
      </button>
    </form>
    <p class="auth-footer">
      Déjà un compte ? <a routerLink="/auth/login">Se connecter</a>
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
      width: 100%; max-width: 480px; box-shadow: 0 25px 50px rgba(0,0,0,.3);
    }
    .auth-header { text-align: center; margin-bottom: 2rem; }
    .auth-logo { font-size: 3rem; margin-bottom: .5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #1e293b; margin: 0; }
    .auth-form { display: flex; flex-direction: column; gap: 1.25rem; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: .4rem; }
    label { font-size: .875rem; font-weight: 600; color: #374151; }
    input {
      padding: .65rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem;
      font-size: .95rem; outline: none; transition: border .2s; width: 100%; box-sizing: border-box;
    }
    input:focus { border-color: #3b82f6; }
    input.invalid { border-color: #ef4444; }
    .field-error { color: #ef4444; font-size: .8rem; }
    .alert { padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; }
    .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .btn { padding: .75rem 1.5rem; border-radius: .5rem; font-size: .95rem; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    .auth-footer { text-align: center; margin-top: 1.5rem; color: #64748b; font-size: .9rem; }
    .auth-footer a { color: #3b82f6; text-decoration: none; font-weight: 600; }
  `]
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal('');

  form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  }, { validators: passwordMatch });

  isInvalid(field: string) {
    const c = this.form.get(field)!;
    return c.invalid && (c.dirty || c.touched);
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    const { firstName, lastName, email, password } = this.form.value;
    this.auth.register({ firstName: firstName!, lastName: lastName!, email: email!, password: password! })
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (e) => {
          this.error.set(e.error?.message ?? "Erreur lors de l'inscription");
          this.loading.set(false);
        }
      });
  }
}
