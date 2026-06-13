import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <span class="logo-icon">👤</span>
      <span class="logo-text">UserMgmt</span>
    </div>
    <nav class="sidebar-nav">
      <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
        <span>🏠</span> Dashboard
      </a>
      <a routerLink="/profile" routerLinkActive="active" class="nav-item">
        <span>👤</span> Mon profil
      </a>
      @if (auth.isAdmin()) {
        <a routerLink="/users" routerLinkActive="active" class="nav-item">
          <span>👥</span> Utilisateurs
        </a>
        <a routerLink="/admin" routerLinkActive="active" class="nav-item">
          <span>⚙</span> Administration
        </a>
      }
    </nav>
    <div class="sidebar-footer">
      <div class="user-info-mini">
        <div class="avatar-mini">{{ initials() }}</div>
        <div>
          <div class="user-name-mini">{{ auth.currentUser()?.firstName }}</div>
          <div class="user-role-mini">{{ auth.currentUser()?.role }}</div>
        </div>
      </div>
      <button class="btn-logout" (click)="auth.logout()">Déconnexion</button>
    </div>
  </aside>
  <main class="main-content">
    <router-outlet />
  </main>
</div>
  `,
  styles: [`
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 240px; background: #1e293b; color: #e2e8f0;
      display: flex; flex-direction: column; padding: 1.5rem 1rem;
      position: fixed; top: 0; left: 0; height: 100vh; z-index: 100;
    }
    .sidebar-logo {
      display: flex; align-items: center; gap: .75rem;
      font-size: 1.25rem; font-weight: 700; padding: .5rem 0 2rem;
      color: white;
    }
    .logo-icon { font-size: 1.5rem; }
    .sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: .25rem; }
    .nav-item {
      display: flex; align-items: center; gap: .75rem;
      padding: .65rem 1rem; border-radius: .5rem;
      color: #94a3b8; text-decoration: none; font-size: .9rem;
      transition: all .2s;
    }
    .nav-item:hover { background: #334155; color: white; }
    .nav-item.active { background: #3b82f6; color: white; }
    .sidebar-footer { border-top: 1px solid #334155; padding-top: 1rem; }
    .user-info-mini { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; }
    .avatar-mini {
      width: 2rem; height: 2rem; border-radius: 50%;
      background: #3b82f6; color: white; display: flex;
      align-items: center; justify-content: center; font-size: .75rem; font-weight: 700;
    }
    .user-name-mini { font-size: .85rem; font-weight: 600; color: white; }
    .user-role-mini { font-size: .75rem; color: #64748b; }
    .btn-logout {
      width: 100%; padding: .5rem; background: #ef4444;
      color: white; border: none; border-radius: .375rem; cursor: pointer; font-size: .85rem;
    }
    .btn-logout:hover { background: #dc2626; }
    .main-content { margin-left: 240px; flex: 1; background: #f8fafc; min-height: 100vh; padding: 2rem; }
  `]
})
export class ShellComponent {
  auth = inject(AuthService);
  initials() {
    const u = this.auth.currentUser();
    return u ? `${u.firstName[0]}${u.lastName[0]}`.toUpperCase() : '?';
  }
}
