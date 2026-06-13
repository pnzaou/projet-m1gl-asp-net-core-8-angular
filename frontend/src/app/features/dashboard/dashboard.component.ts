import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardStats } from '../../shared/models/user.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
<div class="page">
  <div class="page-header">
    <h1>Bonjour, {{ auth.currentUser()?.firstName }} 👋</h1>
    <p class="subtitle">Voici l'état de votre application</p>
  </div>

  @if (auth.isAdmin()) {
    @if (stats()) {
      <div class="stats-grid">
        <div class="stat-card stat-blue">
          <div class="stat-icon">👥</div>
          <div class="stat-value">{{ stats()!.total }}</div>
          <div class="stat-label">Utilisateurs total</div>
        </div>
        <div class="stat-card stat-green">
          <div class="stat-icon">✅</div>
          <div class="stat-value">{{ stats()!.active }}</div>
          <div class="stat-label">Actifs</div>
        </div>
        <div class="stat-card stat-red">
          <div class="stat-icon">🚫</div>
          <div class="stat-value">{{ stats()!.inactive }}</div>
          <div class="stat-label">Inactifs</div>
        </div>
        <div class="stat-card stat-purple">
          <div class="stat-icon">🛡</div>
          <div class="stat-value">{{ stats()!.admins }}</div>
          <div class="stat-label">Admins</div>
        </div>
        <div class="stat-card stat-amber">
          <div class="stat-icon">🆕</div>
          <div class="stat-value">{{ stats()!.newToday }}</div>
          <div class="stat-label">Nouveaux aujourd'hui</div>
        </div>
      </div>
    } @else {
      <div class="stats-grid">
        @for (_ of [1,2,3,4,5]; track $index) {
          <div class="stat-card skeleton"></div>
        }
      </div>
    }
  }

  <div class="section">
    <h2>Actions rapides</h2>
    <div class="actions-grid">
      <a routerLink="/profile" class="action-card">
        <span class="action-icon">👤</span>
        <div>
          <div class="action-title">Mon profil</div>
          <div class="action-desc">Modifier mes informations</div>
        </div>
      </a>
      @if (auth.isAdmin()) {
        <a routerLink="/users" class="action-card">
          <span class="action-icon">👥</span>
          <div>
            <div class="action-title">Gérer les utilisateurs</div>
            <div class="action-desc">Créer, modifier, supprimer</div>
          </div>
        </a>
        <a routerLink="/admin" class="action-card">
          <span class="action-icon">⚙</span>
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
      <span>ℹ️</span>
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
    .section { margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; font-weight: 700; color: #374151; margin: 0 0 1rem; }
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
    .info-card strong { color: #1e40af; }
    .info-card p { margin: .25rem 0 0; color: #3b82f6; font-size: .9rem; }
  `]
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  private userSvc = inject(UserService);
  stats = signal<DashboardStats | null>(null);

  ngOnInit() {
    if (this.auth.isAdmin()) {
      this.userSvc.getStats().subscribe(s => this.stats.set(s));
    }
  }
}
