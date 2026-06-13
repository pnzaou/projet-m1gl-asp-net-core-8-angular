import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { User, DashboardStats } from '../../shared/models/user.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="page">
  <div class="page-header">
    <h1>⚙ Administration</h1>
    <p class="subtitle">Vue d'ensemble et gestion système</p>
  </div>

  @if (stats()) {
    <div class="section">
      <h2>Statistiques système</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue">👥</div>
          <div class="stat-body">
            <div class="stat-val">{{ stats()!.total }}</div>
            <div class="stat-lbl">Utilisateurs total</div>
          </div>
          <div class="stat-bar"><div class="stat-bar-fill blue" style="width:100%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">✅</div>
          <div class="stat-body">
            <div class="stat-val">{{ stats()!.active }}</div>
            <div class="stat-lbl">Actifs ({{ activePct() }}%)</div>
          </div>
          <div class="stat-bar"><div class="stat-bar-fill green" [style.width]="activePct() + '%'"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">🛡</div>
          <div class="stat-body">
            <div class="stat-val">{{ stats()!.admins }}</div>
            <div class="stat-lbl">Admins ({{ adminPct() }}%)</div>
          </div>
          <div class="stat-bar"><div class="stat-bar-fill purple" [style.width]="adminPct() + '%'"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">🆕</div>
          <div class="stat-body">
            <div class="stat-val">{{ stats()!.newToday }}</div>
            <div class="stat-lbl">Nouveaux aujourd'hui</div>
          </div>
          <div class="stat-bar"><div class="stat-bar-fill amber" style="width:100%"></div></div>
        </div>
      </div>
    </div>
  }

  <div class="section">
    <h2>Derniers utilisateurs enregistrés</h2>
    <div class="card user-list">
      @for (user of recentUsers(); track user.id) {
        <div class="user-row">
          <div class="avatar">{{ initials(user) }}</div>
          <div class="user-info">
            <span class="user-name">{{ user.firstName }} {{ user.lastName }}</span>
            <span class="user-email">{{ user.email }}</span>
          </div>
          <span class="badge" [class.admin]="user.role === 'Admin'">{{ user.role }}</span>
          <span class="date">{{ user.createdAt | date:'dd/MM/yy HH:mm' }}</span>
        </div>
      }
      @empty {
        <p class="empty">Aucun utilisateur</p>
      }
    </div>
  </div>

  <div class="section">
    <h2>Actions administrateur</h2>
    <div class="admin-actions">
      <button class="action-btn blue" (click)="refreshStats()">🔄 Actualiser les stats</button>
      <button class="action-btn green" (click)="exportCsv()">📥 Exporter CSV</button>
    </div>
    @if (exportMsg()) { <p class="export-msg">{{ exportMsg() }}</p> }
  </div>

  <div class="section info-section">
    <h2>Informations de session</h2>
    <div class="card session-info">
      <div class="info-row"><span>Utilisateur connecté</span><strong>{{ auth.currentUser()?.firstName }} {{ auth.currentUser()?.lastName }}</strong></div>
      <div class="info-row"><span>Rôle</span><strong>{{ auth.currentUser()?.role }}</strong></div>
      <div class="info-row"><span>Email</span><strong>{{ auth.currentUser()?.email }}</strong></div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .page { max-width: 1100px; }
    .page-header { margin-bottom: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; margin: 0 0 .5rem; }
    .subtitle { color: #64748b; margin: 0; }
    .section { margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; font-weight: 700; color: #374151; margin: 0 0 1rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .stat-card {
      background: white; border-radius: .75rem; padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.1);
      display: flex; flex-direction: column; gap: .75rem;
    }
    .stat-icon { font-size: 1.5rem; width: 3rem; height: 3rem; border-radius: .5rem; display: flex; align-items: center; justify-content: center; }
    .stat-icon.blue { background: #eff6ff; }
    .stat-icon.green { background: #f0fdf4; }
    .stat-icon.purple { background: #faf5ff; }
    .stat-icon.amber { background: #fffbeb; }
    .stat-val { font-size: 1.75rem; font-weight: 700; color: #1e293b; }
    .stat-lbl { font-size: .8rem; color: #64748b; }
    .stat-bar { height: 4px; background: #f1f5f9; border-radius: 9999px; overflow: hidden; }
    .stat-bar-fill { height: 100%; border-radius: 9999px; transition: width .5s; }
    .stat-bar-fill.blue { background: #3b82f6; }
    .stat-bar-fill.green { background: #22c55e; }
    .stat-bar-fill.purple { background: #a855f7; }
    .stat-bar-fill.amber { background: #f59e0b; }
    .card { background: white; border-radius: .75rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow: hidden; }
    .user-list { }
    .user-row {
      display: flex; align-items: center; gap: 1rem; padding: .85rem 1.25rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .user-row:last-child { border-bottom: none; }
    .avatar {
      width: 2.25rem; height: 2.25rem; border-radius: 50%; background: #3b82f6;
      color: white; display: flex; align-items: center; justify-content: center;
      font-size: .75rem; font-weight: 700; flex-shrink: 0;
    }
    .user-info { flex: 1; display: flex; flex-direction: column; }
    .user-name { font-weight: 600; font-size: .9rem; color: #1e293b; }
    .user-email { font-size: .8rem; color: #64748b; }
    .badge {
      padding: .25rem .65rem; border-radius: 9999px; font-size: .75rem; font-weight: 600;
      background: #e0f2fe; color: #0369a1;
    }
    .badge.admin { background: #fce7f3; color: #9d174d; }
    .date { font-size: .8rem; color: #94a3b8; }
    .empty { text-align: center; padding: 2rem; color: #94a3b8; }
    .admin-actions { display: flex; gap: 1rem; flex-wrap: wrap; }
    .action-btn {
      padding: .75rem 1.5rem; border-radius: .5rem; font-size: .9rem;
      font-weight: 600; cursor: pointer; border: none; transition: all .2s;
    }
    .action-btn.blue { background: #eff6ff; color: #3b82f6; }
    .action-btn.blue:hover { background: #dbeafe; }
    .action-btn.green { background: #f0fdf4; color: #16a34a; }
    .action-btn.green:hover { background: #dcfce7; }
    .export-msg { color: #16a34a; font-size: .9rem; margin-top: .75rem; }
    .session-info { padding: 0; }
    .info-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: .85rem 1.25rem; border-bottom: 1px solid #f1f5f9;
    }
    .info-row:last-child { border-bottom: none; }
    .info-row span { color: #64748b; font-size: .9rem; }
    .info-row strong { color: #1e293b; }
  `]
})
export class AdminComponent implements OnInit {
  auth = inject(AuthService);
  private userSvc = inject(UserService);

  stats = signal<DashboardStats | null>(null);
  recentUsers = signal<User[]>([]);
  exportMsg = signal('');

  ngOnInit() {
    this.refreshStats();
    this.userSvc.getAll(1, 5).subscribe(res => this.recentUsers.set(res.items));
  }

  refreshStats() { this.userSvc.getStats().subscribe(s => this.stats.set(s)); }

  activePct() {
    const s = this.stats();
    return s && s.total > 0 ? Math.round(s.active / s.total * 100) : 0;
  }

  adminPct() {
    const s = this.stats();
    return s && s.total > 0 ? Math.round(s.admins / s.total * 100) : 0;
  }

  exportCsv() {
    this.userSvc.getAll(1, 1000).subscribe(res => {
      const header = 'Prénom,Nom,Email,Rôle,Actif,Département,Créé le\n';
      const rows = res.items.map(u =>
        `${u.firstName},${u.lastName},${u.email},${u.role},${u.isActive},${u.department ?? ''},${u.createdAt}`
      ).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'utilisateurs.csv'; a.click();
      URL.revokeObjectURL(url);
      this.exportMsg.set('✅ Export CSV terminé !');
      setTimeout(() => this.exportMsg.set(''), 3000);
    });
  }

  initials(u: User) { return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase(); }
}
