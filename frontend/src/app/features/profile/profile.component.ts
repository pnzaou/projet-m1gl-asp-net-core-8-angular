import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  template: `
<div class="page">
  <div class="page-header">
    <h1>Mon profil</h1>
    <p class="subtitle">Gérez vos informations personnelles</p>
  </div>
  <div class="profile-layout">
    <!-- Carte avatar -->
    <div class="avatar-card">
      <div class="avatar-big">{{ initials() }}</div>
      <div class="avatar-name">{{ auth.currentUser()?.firstName }} {{ auth.currentUser()?.lastName }}</div>
      <div class="avatar-email">{{ auth.currentUser()?.email }}</div>
      <span class="role-badge" [class.admin]="auth.isAdmin()">
        {{ auth.currentUser()?.role }}
      </span>
      <div class="avatar-meta">
        <div class="meta-item">
          <span class="meta-label">Membre depuis</span>
          <span>{{ auth.currentUser()?.createdAt | date:'MMMM yyyy' }}</span>
        </div>
      </div>
    </div>

    <div class="forms-col">
      <!-- Informations personnelles -->
      <div class="card">
        <h2>Informations personnelles</h2>
        @if (infoSuccess()) { <div class="alert alert-success">Profil mis à jour</div> }
        @if (infoError()) { <div class="alert alert-error">{{ infoError() }}</div> }
        <form [formGroup]="infoForm" (ngSubmit)="saveInfo()">
          <div class="form-row">
            <div class="form-group">
              <label>Prénom *</label>
              <input formControlName="firstName" placeholder="Jean" />
            </div>
            <div class="form-group">
              <label>Nom *</label>
              <input formControlName="lastName" placeholder="Dupont" />
            </div>
          </div>
          <div class="form-group">
            <label>Email (non modifiable)</label>
            <input [value]="auth.currentUser()?.email" disabled />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Téléphone</label>
              <input formControlName="phone" placeholder="+33 6 00 00 00 00" />
            </div>
            <div class="form-group">
              <label>Département</label>
              <input formControlName="department" placeholder="RH, Informatique…" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary" [disabled]="savingInfo()">
            @if (savingInfo()) { Sauvegarde… } @else { Sauvegarder }
          </button>
        </form>
      </div>

      <!-- Changement de mot de passe -->
      <div class="card">
        <h2>Changer le mot de passe</h2>
        @if (pwdSuccess()) { <div class="alert alert-success">Mot de passe modifié</div> }
        @if (pwdError()) { <div class="alert alert-error">{{ pwdError() }}</div> }
        <form [formGroup]="pwdForm" (ngSubmit)="savePassword()">
          <div class="form-group">
            <label>Mot de passe actuel *</label>
            <input type="password" formControlName="currentPassword" />
          </div>
          <div class="form-group">
            <label>Nouveau mot de passe *</label>
            <input type="password" formControlName="newPassword" placeholder="Min. 8 caractères" />
          </div>
          <div class="form-group">
            <label>Confirmer *</label>
            <input type="password" formControlName="confirmPassword" />
            @if (pwdForm.hasError('mismatch') && pwdForm.get('confirmPassword')?.touched) {
              <span class="field-error">Mots de passe différents</span>
            }
          </div>
          <button type="submit" class="btn btn-primary" [disabled]="savingPwd()">
            Changer le mot de passe
          </button>
        </form>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .page { max-width: 1000px; }
    .page-header { margin-bottom: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; margin: 0 0 .5rem; }
    .subtitle { color: #64748b; margin: 0; }
    .profile-layout { display: grid; grid-template-columns: 260px 1fr; gap: 1.5rem; align-items: start; }
    .avatar-card {
      background: white; border-radius: .75rem; padding: 2rem 1.5rem;
      text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1);
    }
    .avatar-big {
      width: 5rem; height: 5rem; border-radius: 50%; background: #3b82f6;
      color: white; font-size: 1.5rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;
    }
    .avatar-name { font-size: 1.1rem; font-weight: 700; color: #1e293b; }
    .avatar-email { font-size: .8rem; color: #64748b; margin: .25rem 0 .75rem; }
    .role-badge {
      display: inline-block; padding: .25rem .75rem; border-radius: 9999px;
      font-size: .75rem; font-weight: 600; background: #e0f2fe; color: #0369a1;
    }
    .role-badge.admin { background: #fce7f3; color: #9d174d; }
    .avatar-meta { margin-top: 1.5rem; text-align: left; }
    .meta-item { display: flex; flex-direction: column; gap: .2rem; }
    .meta-label { font-size: .75rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; }
    .forms-col { display: flex; flex-direction: column; gap: 1.5rem; }
    .card { background: white; border-radius: .75rem; padding: 1.75rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    h2 { font-size: 1.1rem; font-weight: 700; color: #1e293b; margin: 0 0 1.25rem; }
    .alert { padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; margin-bottom: 1rem; }
    .alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    form { display: flex; flex-direction: column; gap: 1rem; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: .4rem; }
    label { font-size: .875rem; font-weight: 600; color: #374151; }
    input {
      padding: .65rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem;
      font-size: .9rem; outline: none; transition: border .2s; width: 100%; box-sizing: border-box;
    }
    input:focus { border-color: #3b82f6; }
    input:disabled { background: #f8fafc; color: #94a3b8; }
    .field-error { color: #ef4444; font-size: .8rem; }
    .btn { padding: .65rem 1.5rem; border-radius: .5rem; font-size: .9rem; font-weight: 600; cursor: pointer; border: none; align-self: flex-start; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
  `]
})
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);
  private userSvc = inject(UserService);
  private fb = inject(FormBuilder);

  savingInfo = signal(false);
  savingPwd = signal(false);
  infoSuccess = signal(false);
  infoError = signal('');
  pwdSuccess = signal(false);
  pwdError = signal('');

  infoForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    phone: [''],
    department: ['']
  });

  pwdForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  }, {
    validators: (c) => c.get('newPassword')?.value === c.get('confirmPassword')?.value
      ? null : { mismatch: true }
  });

  ngOnInit() {
    const u = this.auth.currentUser();
    if (u) this.infoForm.patchValue(u as any);
  }

  saveInfo() {
    if (this.infoForm.invalid) { this.infoForm.markAllAsTouched(); return; }
    this.savingInfo.set(true);
    this.userSvc.updateMe(this.infoForm.value as any).subscribe({
      next: (user) => {
        this.auth.updateLocalUser(user);
        this.infoSuccess.set(true);
        this.savingInfo.set(false);
        setTimeout(() => this.infoSuccess.set(false), 3000);
      },
      error: (e) => { this.infoError.set(e.error?.message ?? 'Erreur'); this.savingInfo.set(false); }
    });
  }

  savePassword() {
    if (this.pwdForm.invalid) { this.pwdForm.markAllAsTouched(); return; }
    this.savingPwd.set(true);
    const { currentPassword, newPassword } = this.pwdForm.value;
    this.userSvc.changePassword(currentPassword!, newPassword!).subscribe({
      next: () => {
        this.pwdSuccess.set(true);
        this.pwdForm.reset();
        this.savingPwd.set(false);
        setTimeout(() => this.pwdSuccess.set(false), 3000);
      },
      error: (e) => { this.pwdError.set(e.error?.message ?? 'Erreur'); this.savingPwd.set(false); }
    });
  }

  initials() {
    const u = this.auth.currentUser();
    return u ? `${u.firstName[0]}${u.lastName[0]}`.toUpperCase() : '?';
  }
}
