import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { User } from '../../shared/models/user.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
<div class="page">
  <div class="page-header">
    <h1>👥 Utilisateurs</h1>
    <button class="btn btn-primary" (click)="openModal('create')">+ Nouvel utilisateur</button>
  </div>

  <!-- Filtres -->
  <div class="filters">
    <input class="search-input" placeholder="Rechercher..." (input)="search.set($any($event.target).value); page.set(1); load()" />
    <select (change)="roleFilter.set($any($event.target).value); page.set(1); load()">
      <option value="">Tous les rôles</option>
      <option value="User">User</option>
      <option value="Admin">Admin</option>
    </select>
  </div>

  <!-- Table -->
  <div class="table-wrap">
    @if (loading()) {
      <div class="loading-bar">Chargement...</div>
    }
    <table>
      <thead>
        <tr>
          <th>Utilisateur</th>
          <th>Email</th>
          <th>Rôle</th>
          <th>Statut</th>
          <th>Créé le</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        @for (user of users(); track user.id) {
          <tr>
            <td>
              <div class="user-cell">
                <div class="avatar">{{ initials(user) }}</div>
                <span>{{ user.firstName }} {{ user.lastName }}</span>
              </div>
            </td>
            <td>{{ user.email }}</td>
            <td><span class="badge" [class.admin]="user.role === 'Admin'">{{ user.role }}</span></td>
            <td>
              <span class="status" [class.active]="user.isActive">
                {{ user.isActive ? 'Actif' : 'Inactif' }}
              </span>
            </td>
            <td>{{ user.createdAt | date:'dd/MM/yyyy' }}</td>
            <td>
              <div class="actions">
                <button class="btn-icon" title="Modifier" (click)="openModal('edit', user)">✏️</button>
                <button class="btn-icon" title="Toggle actif" (click)="toggleActive(user)">
                  {{ user.isActive ? '🚫' : '✅' }}
                </button>
                <button class="btn-icon btn-danger" title="Supprimer" (click)="deleteTarget.set(user)">🗑️</button>
              </div>
            </td>
          </tr>
        }
        @empty {
          <tr><td colspan="6" class="empty">Aucun utilisateur trouvé</td></tr>
        }
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  <div class="pagination">
    <button [disabled]="page() <= 1" (click)="page.set(page() - 1); load()">‹ Précédent</button>
    @for (p of pageNumbers(); track p) {
      <button [class.current]="p === page()" (click)="page.set(p); load()">{{ p }}</button>
    }
    <button [disabled]="page() * pageSize >= totalCount()" (click)="page.set(page() + 1); load()">Suivant ›</button>
    <span class="total">{{ totalCount() }} utilisateurs</span>
  </div>
</div>

<!-- Modal Création/Édition -->
@if (modalMode()) {
  <div class="modal-overlay" (click)="modalMode.set(null)">
    <div class="modal" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h2>{{ modalMode() === 'create' ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur' }}</h2>
        <button class="modal-close" (click)="modalMode.set(null)">✕</button>
      </div>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        @if (formError()) { <div class="alert alert-error">{{ formError() }}</div> }
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
          <label>Email *</label>
          <input type="email" formControlName="email" placeholder="jean@exemple.com"
            [attr.disabled]="modalMode() === 'edit' ? true : null" />
        </div>
        @if (modalMode() === 'create') {
          <div class="form-group">
            <label>Mot de passe *</label>
            <input type="password" formControlName="password" placeholder="Min. 8 caractères" />
          </div>
        }
        <div class="form-row">
          <div class="form-group">
            <label>Rôle</label>
            <select formControlName="role">
              <option value="User">User</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div class="form-group">
            <label>Département</label>
            <input formControlName="department" placeholder="RH, IT..." />
          </div>
        </div>
        <div class="form-group">
          <label>Téléphone</label>
          <input formControlName="phone" placeholder="+33 6 00 00 00 00" />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" (click)="modalMode.set(null)">Annuler</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Sauvegarde...' : (modalMode() === 'create' ? 'Créer' : 'Modifier') }}
          </button>
        </div>
      </form>
    </div>
  </div>
}

<!-- Modal Suppression -->
@if (deleteTarget()) {
  <div class="modal-overlay" (click)="deleteTarget.set(null)">
    <div class="modal modal-sm" (click)="$event.stopPropagation()">
      <h2>Confirmer la suppression</h2>
      <p>Voulez-vous vraiment supprimer <strong>{{ deleteTarget()!.firstName }} {{ deleteTarget()!.lastName }}</strong> ?</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" (click)="deleteTarget.set(null)">Annuler</button>
        <button class="btn btn-danger" (click)="deleteUser()">Supprimer</button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    .page { max-width: 1200px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; margin: 0; }
    .filters { display: flex; gap: 1rem; margin-bottom: 1rem; }
    .search-input, select {
      padding: .6rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem;
      font-size: .9rem; outline: none;
    }
    .search-input { flex: 1; }
    .search-input:focus, select:focus { border-color: #3b82f6; }
    .table-wrap { background: white; border-radius: .75rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow: hidden; }
    .loading-bar { padding: .75rem 1.5rem; background: #eff6ff; color: #3b82f6; font-size: .85rem; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f8fafc; }
    th { padding: .75rem 1rem; text-align: left; font-size: .8rem; font-weight: 600; color: #64748b; text-transform: uppercase; }
    td { padding: .85rem 1rem; border-top: 1px solid #f1f5f9; color: #374151; font-size: .9rem; }
    tr:hover td { background: #f8fafc; }
    .user-cell { display: flex; align-items: center; gap: .75rem; }
    .avatar {
      width: 2rem; height: 2rem; border-radius: 50%; background: #3b82f6;
      color: white; display: flex; align-items: center; justify-content: center;
      font-size: .7rem; font-weight: 700; flex-shrink: 0;
    }
    .badge {
      padding: .25rem .65rem; border-radius: 9999px; font-size: .75rem; font-weight: 600;
      background: #e0f2fe; color: #0369a1;
    }
    .badge.admin { background: #fce7f3; color: #9d174d; }
    .status {
      padding: .25rem .65rem; border-radius: 9999px; font-size: .75rem; font-weight: 600;
      background: #fef2f2; color: #dc2626;
    }
    .status.active { background: #f0fdf4; color: #16a34a; }
    .actions { display: flex; gap: .25rem; }
    .btn-icon {
      background: none; border: 1px solid #e5e7eb; border-radius: .375rem;
      padding: .3rem .5rem; cursor: pointer; font-size: .9rem; transition: all .2s;
    }
    .btn-icon:hover { background: #f1f5f9; }
    .btn-icon.btn-danger:hover { background: #fef2f2; border-color: #fecaca; }
    .empty { text-align: center; padding: 3rem !important; color: #94a3b8; }
    .pagination {
      display: flex; align-items: center; gap: .5rem; margin-top: 1rem;
      justify-content: center;
    }
    .pagination button {
      padding: .4rem .75rem; border: 1px solid #e5e7eb; border-radius: .375rem;
      background: white; cursor: pointer; font-size: .85rem;
    }
    .pagination button:disabled { opacity: .4; cursor: not-allowed; }
    .pagination button.current { background: #3b82f6; color: white; border-color: #3b82f6; }
    .total { color: #64748b; font-size: .85rem; margin-left: .5rem; }
    .btn { padding: .65rem 1.25rem; border-radius: .5rem; font-size: .9rem; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    .btn-secondary { background: #f1f5f9; color: #374151; }
    .btn-danger { background: #ef4444; color: white; }
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.5);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal {
      background: white; border-radius: 1rem; padding: 2rem;
      width: 100%; max-width: 520px; box-shadow: 0 25px 50px rgba(0,0,0,.3);
      display: flex; flex-direction: column; gap: 1.25rem;
    }
    .modal-sm { max-width: 380px; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; }
    .modal-header h2 { margin: 0; font-size: 1.2rem; color: #1e293b; }
    .modal-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b; }
    .modal-footer { display: flex; gap: .75rem; justify-content: flex-end; margin-top: .5rem; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: .4rem; }
    label { font-size: .875rem; font-weight: 600; color: #374151; }
    input, select {
      padding: .65rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem;
      font-size: .9rem; outline: none; width: 100%; box-sizing: border-box;
    }
    input:focus, select:focus { border-color: #3b82f6; }
    .alert { padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; }
    .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  `]
})
export class UsersComponent implements OnInit {
  private userSvc = inject(UserService);
  private fb = inject(FormBuilder);

  users = signal<User[]>([]);
  loading = signal(true);
  saving = signal(false);
  formError = signal('');
  page = signal(1);
  totalCount = signal(0);
  search = signal('');
  roleFilter = signal('');
  pageSize = 10;
  modalMode = signal<'create' | 'edit' | null>(null);
  editTarget = signal<User | null>(null);
  deleteTarget = signal<User | null>(null);

  form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    role: ['User'],
    department: [''],
    phone: ['']
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.userSvc.getAll(this.page(), this.pageSize, this.search(), this.roleFilter())
      .subscribe(res => {
        this.users.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      });
  }

  openModal(mode: 'create' | 'edit', user?: User) {
    this.modalMode.set(mode);
    this.editTarget.set(user ?? null);
    this.formError.set('');
    if (mode === 'edit' && user) {
      this.form.patchValue(user);
      this.form.get('password')?.clearValidators();
    } else {
      this.form.reset({ role: 'User' });
      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    }
    this.form.get('password')?.updateValueAndValidity();
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const action = this.modalMode() === 'create'
      ? this.userSvc.create(this.form.value)
      : this.userSvc.update(this.editTarget()!.id, this.form.value);

    action.subscribe({
      next: () => { this.modalMode.set(null); this.load(); this.saving.set(false); },
      error: (e) => { this.formError.set(e.error?.message ?? 'Erreur'); this.saving.set(false); }
    });
  }

  toggleActive(user: User) {
    this.userSvc.toggleActive(user.id).subscribe(() => this.load());
  }

  deleteUser() {
    this.userSvc.delete(this.deleteTarget()!.id).subscribe(() => {
      this.deleteTarget.set(null);
      this.load();
    });
  }

  pageNumbers() {
    const total = Math.ceil(this.totalCount() / this.pageSize);
    const cur = this.page();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) pages.push(i);
    return pages;
  }

  initials(u: User) { return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase(); }
}
