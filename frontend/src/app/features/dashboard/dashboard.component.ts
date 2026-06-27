import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardStats, User } from '../../shared/models/user.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
<div class="page">
  <div class="page-header">
    <h1>Bonjour, {{ auth.currentUser()?.firstName }}</h1>
    <p class="subtitle">
      @if (auth.isSuperAdmin()) { Vue SuperAdmin — contrôle total du système }
      @else { Voici l'état de votre application }
    </p>
  </div>

  <!-- Stats (Admin + SuperAdmin) ───────────────────────────────────── -->
  @if (auth.isAdmin()) {
    @if (stats()) {
      <div class="stats-grid">
        <div class="stat-card stat-blue">
          <div class="stat-icon"><i class="fa-solid fa-users"></i></div>
          <div class="stat-value">{{ stats()!.total }}</div>
          <div class="stat-label">Utilisateurs total</div>
        </div>
        <div class="stat-card stat-green">
          <div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="stat-value">{{ stats()!.active }}</div>
          <div class="stat-label">Actifs</div>
        </div>
        <div class="stat-card stat-amber">
          <div class="stat-icon"><i class="fa-solid fa-user-plus"></i></div>
          <div class="stat-value">{{ stats()!.newToday }}</div>
          <div class="stat-label">Nouveaux aujourd'hui</div>
        </div>
      </div>
    } @else {
      <div class="stats-grid">
        @for (_ of [1,2,3]; track $index) {
          <div class="stat-card skeleton"></div>
        }
      </div>
    }
  }

  <!-- Liste des utilisateurs (SuperAdmin uniquement) ──────────────── -->
  @if (auth.isSuperAdmin()) {
    <div class="section">
      <div class="users-header">
        <h2>Liste des utilisateurs</h2>
        <div class="users-toolbar">
          <input
            class="search-input"
            placeholder="Rechercher..."
            [(ngModel)]="searchTerm"
            (input)="onSearch()"
          />
          <a routerLink="/users" class="btn-manage">Gérer →</a>
        </div>
      </div>

      @if (usersLoading()) {
        <div class="table-skeleton">
          @for (_ of [1,2,3,4,5]; track $index) {
            <div class="row-skeleton"></div>
          }
        </div>
      } @else {
        <div class="users-table-wrap">
          <table class="users-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Créé le</th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td>
                    <div class="user-cell">
                      <div class="avatar" [class]="avatarClass(u.role)">{{ initials(u) }}</div>
                      <span>{{ u.firstName }} {{ u.lastName }}</span>
                    </div>
                  </td>
                  <td class="email">{{ u.email }}</td>
                  <td>
                    <span class="badge" [class]="roleBadge(u.role)">{{ u.role }}</span>
                  </td>
                  <td>
                    <span class="badge" [class]="u.isActive ? 'badge-green' : 'badge-red'">
                      {{ u.isActive ? 'Actif' : 'Inactif' }}
                    </span>
                  </td>
                  <td class="date">{{ u.createdAt | date:'dd/MM/yy' }}</td>
                </tr>
              }
              @empty {
                <tr><td colspan="5" class="empty">Aucun utilisateur trouvé</td></tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination ─────────────────────────────────────────────── -->
        @if (totalPages() > 1) {
          <div class="pagination">
            <button [disabled]="usersPage() === 1" (click)="goToPage(usersPage() - 1)">‹</button>
            @for (p of pageNumbers(); track p) {
              <button [class.active]="p === usersPage()" (click)="goToPage(p)">{{ p }}</button>
            }
            <button [disabled]="usersPage() === totalPages()" (click)="goToPage(usersPage() + 1)">›</button>
            <span class="page-info">{{ usersPage() }}/{{ totalPages() }} — {{ usersTotal() }} utilisateurs</span>
          </div>
        }
      }
    </div>
  }

  <!-- Actions rapides ──────────────────────────────────────────────── -->
  <div class="section">
    <h2>Actions rapides</h2>
    <div class="actions-grid">
      <a routerLink="/profile" class="action-card">
        <span class="action-icon"><i class="fa-solid fa-user"></i></span>
        <div>
          <div class="action-title">Mon profil</div>
          <div class="action-desc">Modifier mes informations</div>
        </div>
      </a>
      @if (!auth.isSuperAdmin()) {
        <a routerLink="/memoires" class="action-card">
          <span class="action-icon"><i class="fa-solid fa-file-lines"></i></span>
          <div>
            <div class="action-title">Mes mémoires</div>
            <div class="action-desc">Soumettre et suivre mes mémoires</div>
          </div>
        </a>
      }
      @if (auth.isAdmin()) {
        <a routerLink="/admin/memoires" class="action-card">
          <span class="action-icon"><i class="fa-solid fa-clipboard-list"></i></span>
          <div>
            <div class="action-title">Gestion mémoires</div>
            <div class="action-desc">Valider et rejeter les soumissions</div>
          </div>
        </a>
        <a routerLink="/users" class="action-card">
          <span class="action-icon"><i class="fa-solid fa-users"></i></span>
          <div>
            <div class="action-title">Gérer les utilisateurs</div>
            <div class="action-desc">Créer, modifier, supprimer</div>
          </div>
        </a>
        <a routerLink="/admin" class="action-card">
          <span class="action-icon"><i class="fa-solid fa-gear"></i></span>
          <div>
            <div class="action-title">Administration</div>
            <div class="action-desc">Paramètres système</div>
          </div>
        </a>
      }
    </div>
  </div>

  @if (!auth.isAdmin()) {
    <div class="info-card">
      <i class="fa-solid fa-circle-info info-icon"></i>
      <div>
        <strong>Compte utilisateur standard</strong>
        <p>Contactez un administrateur pour des droits supplémentaires.</p>
      </div>
    </div>
  }
</div>
  `,
  styles: [`
    .page { max-width: 1100px; }
    .page-header { margin-bottom: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; margin: 0 0 .5rem; }
    .subtitle { color: #64748b; margin: 0; }

    /* Stats */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card {
      background: white; border-radius: .75rem; padding: 1.5rem;
      text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); border-top: 4px solid transparent;
    }
    .stat-card.stat-blue { border-top-color: #3b82f6; }
    .stat-card.stat-green { border-top-color: #22c55e; }
    .stat-card.stat-red { border-top-color: #ef4444; }
    .stat-card.stat-purple { border-top-color: #a855f7; }
    .stat-card.stat-amber { border-top-color: #f59e0b; }
    .stat-icon { font-size: 2rem; margin-bottom: .5rem; }
    .stat-value { font-size: 2rem; font-weight: 700; color: #1e293b; }
    .stat-label { font-size: .8rem; color: #64748b; margin-top: .25rem; }
    .stat-card.skeleton { min-height: 130px; background: #e2e8f0; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

    /* Section */
    .section { margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; font-weight: 700; color: #374151; margin: 0 0 1rem; }

    /* Users table */
    .users-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: .75rem; }
    .users-header h2 { margin: 0; }
    .users-toolbar { display: flex; align-items: center; gap: .75rem; }
    .search-input {
      padding: .5rem .875rem; border: 1px solid #e2e8f0; border-radius: .5rem;
      font-size: .875rem; outline: none; width: 220px;
    }
    .search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
    .btn-manage {
      padding: .5rem 1rem; background: #3b82f6; color: white; border-radius: .5rem;
      text-decoration: none; font-size: .85rem; font-weight: 600; white-space: nowrap;
    }
    .btn-manage:hover { background: #2563eb; }
    .users-table-wrap { overflow-x: auto; border-radius: .75rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .users-table { width: 100%; border-collapse: collapse; background: white; }
    .users-table th {
      background: #f8fafc; padding: .75rem 1rem; text-align: left;
      font-size: .8rem; font-weight: 600; color: #64748b; text-transform: uppercase;
      letter-spacing: .05em; border-bottom: 1px solid #e2e8f0;
    }
    .users-table td { padding: .875rem 1rem; border-bottom: 1px solid #f1f5f9; font-size: .9rem; }
    .users-table tr:last-child td { border-bottom: none; }
    .users-table tr:hover td { background: #f8fafc; }
    .user-cell { display: flex; align-items: center; gap: .75rem; }
    .avatar {
      width: 2rem; height: 2rem; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: .75rem; font-weight: 700; color: white; flex-shrink: 0;
    }
    .avatar-blue { background: #3b82f6; }
    .avatar-purple { background: #a855f7; }
    .avatar-gold { background: #f59e0b; }
    .email { color: #64748b; font-size: .85rem; }
    .date { color: #94a3b8; font-size: .82rem; }
    .empty { text-align: center; color: #94a3b8; padding: 2rem !important; }

    /* Badges */
    .badge { padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-purple { background: #f3e8ff; color: #7e22ce; }
    .badge-gold { background: #fef3c7; color: #92400e; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }

    /* Skeleton */
    .table-skeleton { background: white; border-radius: .75rem; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .row-skeleton { height: 56px; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-bottom: 1px solid #f1f5f9; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* Pagination */
    .pagination { display: flex; align-items: center; gap: .375rem; margin-top: 1rem; flex-wrap: wrap; }
    .pagination button {
      width: 2rem; height: 2rem; border: 1px solid #e2e8f0; border-radius: .375rem;
      background: white; cursor: pointer; font-size: .85rem; display: flex; align-items: center; justify-content: center;
    }
    .pagination button:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; }
    .pagination button.active { background: #3b82f6; color: white; border-color: #3b82f6; }
    .pagination button:disabled { opacity: .4; cursor: not-allowed; }
    .page-info { font-size: .8rem; color: #64748b; margin-left: .5rem; }

    /* Actions */
    .actions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .action-card {
      background: white; border-radius: .75rem; padding: 1.25rem;
      display: flex; align-items: center; gap: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.1); text-decoration: none;
      transition: all .2s; border: 2px solid transparent;
    }
    .action-card:hover { border-color: #3b82f6; transform: translateY(-2px); }
    .action-icon { font-size: 1.75rem; }
    .action-title { font-weight: 600; color: #1e293b; }
    .action-desc { font-size: .8rem; color: #64748b; }
    .info-card {
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: .75rem;
      padding: 1.25rem; display: flex; align-items: flex-start; gap: 1rem;
    }
    .info-icon { font-size: 1.25rem; color: #3b82f6; flex-shrink: 0; margin-top: .1rem; }
    .info-card strong { color: #1e40af; }
    .info-card p { margin: .25rem 0 0; color: #3b82f6; font-size: .9rem; }
  `]
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  private userSvc = inject(UserService);

  stats = signal<DashboardStats | null>(null);
  users = signal<User[]>([]);
  usersLoading = signal(false);
  usersPage = signal(1);
  usersTotal = signal(0);
  searchTerm = '';
  private readonly pageSize = 8;

  ngOnInit() {
    if (this.auth.isAdmin()) {
      this.userSvc.getStats().subscribe(s => this.stats.set(s));
    }
    if (this.auth.isSuperAdmin()) {
      this.loadUsers();
    }
  }

  loadUsers() {
    this.usersLoading.set(true);
    this.userSvc.getAll(this.usersPage(), this.pageSize, this.searchTerm)
      .subscribe(res => {
        this.users.set(res.items);
        this.usersTotal.set(res.totalCount);
        this.usersLoading.set(false);
      });
  }

  onSearch() {
    this.usersPage.set(1);
    this.loadUsers();
  }

  goToPage(p: number) {
    this.usersPage.set(p);
    this.loadUsers();
  }

  totalPages() {
    return Math.ceil(this.usersTotal() / this.pageSize) || 1;
  }

  pageNumbers() {
    const total = this.totalPages();
    const cur = this.usersPage();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) pages.push(i);
    return pages;
  }

  initials(u: User) {
    return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  }

  avatarClass(role: string) {
    if (role === 'SuperAdmin') return 'avatar avatar-gold';
    if (role === 'Admin') return 'avatar avatar-purple';
    return 'avatar avatar-blue';
  }

  roleBadge(role: string) {
    if (role === 'SuperAdmin') return 'badge badge-gold';
    if (role === 'Admin') return 'badge badge-purple';
    return 'badge badge-blue';
  }
}
