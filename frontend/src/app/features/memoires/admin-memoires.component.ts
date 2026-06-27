import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MemoireService } from '../../core/services/memoire.service';
import { Memoire } from '../../shared/models/memoire.model';

type ReviewMode = 'valider' | 'rejeter';

@Component({
  selector: 'app-admin-memoires',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="page">
  <div class="page-header">
    <div>
      <h1><i class="fa-solid fa-clipboard-list"></i> Gestion des mémoires</h1>
      <p class="subtitle">Examinez et validez les soumissions des étudiants</p>
    </div>
  </div>

  <!-- Filtres ──────────────────────────────────────────────────────────── -->
  <div class="filters">
    <input
      class="search-input"
      placeholder="Rechercher par titre, auteur, spécialité..."
      [(ngModel)]="searchTerm"
      (input)="onSearch()"
    />
    <select [(ngModel)]="statutFilter" (change)="onSearch()">
      <option value="">Tous les statuts</option>
      <option value="Delivre">Délivré</option>
      <option value="Valide">Validé</option>
      <option value="Rejete">Rejeté</option>
    </select>
  </div>

  <!-- Compteurs ─────────────────────────────────────────────────────────── -->
  <div class="counts">
    <span class="count-badge count-all">{{ total() }} total</span>
    <span class="count-badge count-pending">{{ countByStatut('Delivre') }} en attente</span>
    <span class="count-badge count-ok">{{ countByStatut('Valide') }} validés</span>
    <span class="count-badge count-ko">{{ countByStatut('Rejete') }} rejetés</span>
  </div>

  <!-- Table ─────────────────────────────────────────────────────────────── -->
  @if (loading()) {
    <div class="loading">Chargement...</div>
  } @else if (memoires().length === 0) {
    <div class="empty">Aucun mémoire trouvé.</div>
  } @else {
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Titre / Auteur</th>
            <th>Spécialité</th>
            <th>Année</th>
            <th>Étudiant</th>
            <th>Statut</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (m of memoires(); track m.id) {
            <tr>
              <td>
                <div class="titre">{{ m.titre }}</div>
                <div class="auteur">{{ m.auteur }}</div>
              </td>
              <td class="specialite">{{ m.specialite }}</td>
              <td class="annee">{{ m.annee }}</td>
              <td class="etudiant">{{ m.userFullName }}</td>
              <td>
                <span class="badge" [class]="'badge-' + statutColor(m.statut)">
                  <i class="fa-solid" [class]="statutIcon(m.statut)"></i> {{ statutLabel(m.statut) }}
                </span>
              </td>
              <td class="date">{{ m.createdAt | date:'dd/MM/yy' }}</td>
              <td>
                <div class="actions">
                  <button
                    class="btn-action btn-valider"
                    title="Valider"
                    (click)="openReview(m, 'valider')"
                    [disabled]="m.statut === 'Valide'"
                  ><i class="fa-solid fa-circle-check"></i></button>
                  <button
                    class="btn-action btn-rejeter"
                    title="Rejeter"
                    (click)="openReview(m, 'rejeter')"
                    [disabled]="m.statut === 'Rejete'"
                  ><i class="fa-solid fa-circle-xmark"></i></button>
                  <button
                    class="btn-action btn-detail"
                    title="Détail"
                    (click)="selected.set(m)"
                  ><i class="fa-solid fa-eye"></i></button>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Pagination ─────────────────────────────────────────────────────── -->
    @if (totalPages() > 1) {
      <div class="pagination">
        <button [disabled]="page() <= 1" (click)="goTo(page() - 1)">‹</button>
        @for (p of pageNums(); track p) {
          <button [class.active]="p === page()" (click)="goTo(p)">{{ p }}</button>
        }
        <button [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">›</button>
        <span class="page-info">{{ page() }}/{{ totalPages() }} — {{ total() }} mémoires</span>
      </div>
    }
  }
</div>

<!-- Modal détail ─────────────────────────────────────────────────────────── -->
@if (selected()) {
  <div class="modal-overlay" (click)="selected.set(null)">
    <div class="modal modal-lg" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h2>{{ selected()!.titre }}</h2>
        <button class="modal-close" (click)="selected.set(null)"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="detail-grid">
        <div class="detail-row"><strong>Auteur :</strong> {{ selected()!.auteur }}</div>
        <div class="detail-row"><strong>Spécialité :</strong> {{ selected()!.specialite }}</div>
        <div class="detail-row"><strong>Année :</strong> {{ selected()!.annee }}</div>
        @if (selected()!.promoteur) {
          <div class="detail-row"><strong>Promoteur :</strong> {{ selected()!.promoteur }}</div>
        }
        <div class="detail-row"><strong>Étudiant :</strong> {{ selected()!.userFullName }}</div>
        <div class="detail-row">
          <strong>Statut :</strong>
          <span class="badge" [class]="'badge-' + statutColor(selected()!.statut)"><i class="fa-solid" [class]="statutIcon(selected()!.statut)"></i> {{ statutLabel(selected()!.statut) }}</span>
        </div>
        @if (selected()!.description) {
          <div class="detail-full"><strong>Résumé :</strong><p>{{ selected()!.description }}</p></div>
        }
        @if (selected()!.statut === 'Rejete' && selected()!.noteRejet) {
          <div class="detail-full rejection">
            <strong>Motif du rejet :</strong>
            <p>{{ selected()!.noteRejet }}</p>
          </div>
        }
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" (click)="selected.set(null)">Fermer</button>
        @if (selected()!.statut !== 'Valide') {
          <button class="btn btn-success" (click)="openReview(selected()!, 'valider'); selected.set(null)"><i class="fa-solid fa-circle-check"></i> Valider</button>
        }
        @if (selected()!.statut !== 'Rejete') {
          <button class="btn btn-danger" (click)="openReview(selected()!, 'rejeter'); selected.set(null)"><i class="fa-solid fa-circle-xmark"></i> Rejeter</button>
        }
      </div>
    </div>
  </div>
}

<!-- Modal review (valider / rejeter) ──────────────────────────────────────── -->
@if (reviewTarget()) {
  <div class="modal-overlay" (click)="reviewTarget.set(null)">
    <div class="modal" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h2>
          <i class="fa-solid" [class.fa-circle-check]="reviewMode() === 'valider'" [class.fa-circle-xmark]="reviewMode() === 'rejeter'"></i>
          {{ reviewMode() === 'valider' ? 'Valider le mémoire' : 'Rejeter le mémoire' }}
        </h2>
        <button class="modal-close" (click)="reviewTarget.set(null)"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <p class="review-titre">{{ reviewTarget()!.titre }}</p>

      @if (reviewMode() === 'rejeter') {
        <div class="form-group">
          <label>Motif du rejet *</label>
          <textarea
            [(ngModel)]="noteRejet"
            rows="4"
            placeholder="Expliquez la raison du rejet..."
          ></textarea>
        </div>
      } @else {
        <p class="confirm-text">Confirmez-vous la validation de ce mémoire ?</p>
      }

      @if (reviewError()) {
        <div class="alert alert-error">{{ reviewError() }}</div>
      }
      <div class="modal-footer">
        <button class="btn btn-secondary" (click)="reviewTarget.set(null)">Annuler</button>
        <button
          class="btn"
          [class]="reviewMode() === 'valider' ? 'btn-success' : 'btn-danger'"
          [disabled]="acting()"
          (click)="doReview()"
        >
          {{ acting() ? 'En cours...' : (reviewMode() === 'valider' ? 'Valider' : 'Rejeter') }}
        </button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    .page { max-width: 1200px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
    h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; margin: 0 0 .25rem; }
    .subtitle { color: #64748b; margin: 0; }

    .filters { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search-input {
      flex: 1; min-width: 200px; padding: .6rem 1rem; border: 2px solid #e5e7eb;
      border-radius: .5rem; font-size: .9rem; outline: none;
    }
    .search-input:focus { border-color: #3b82f6; }
    select { padding: .6rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem; font-size: .9rem; outline: none; }

    .counts { display: flex; gap: .5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .count-badge { padding: .3rem .75rem; border-radius: 9999px; font-size: .8rem; font-weight: 600; }
    .count-all { background: #f1f5f9; color: #475569; }
    .count-pending { background: #dbeafe; color: #1d4ed8; }
    .count-ok { background: #dcfce7; color: #166534; }
    .count-ko { background: #fee2e2; color: #991b1b; }

    .loading, .empty { color: #64748b; text-align: center; padding: 3rem; }

    .table-wrap { background: white; border-radius: .75rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f8fafc; }
    th { padding: .75rem 1rem; text-align: left; font-size: .78rem; font-weight: 600; color: #64748b; text-transform: uppercase; }
    td { padding: .85rem 1rem; border-top: 1px solid #f1f5f9; font-size: .88rem; color: #374151; }
    tr:hover td { background: #f8fafc; }
    .titre { font-weight: 600; color: #1e293b; }
    .auteur { font-size: .78rem; color: #64748b; }
    .specialite, .annee, .date, .etudiant { color: #64748b; font-size: .85rem; }
    .annee { white-space: nowrap; }

    .badge { padding: .2rem .6rem; border-radius: 9999px; font-size: .75rem; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }

    .actions { display: flex; gap: .25rem; }
    .btn-action { background: none; border: 1px solid #e5e7eb; border-radius: .375rem; padding: .3rem .5rem; cursor: pointer; font-size: .9rem; }
    .btn-action:disabled { opacity: .35; cursor: not-allowed; }
    .btn-action.btn-valider:hover:not(:disabled) { background: #f0fdf4; border-color: #86efac; }
    .btn-action.btn-rejeter:hover:not(:disabled) { background: #fef2f2; border-color: #fca5a5; }
    .btn-action.btn-detail:hover { background: #eff6ff; border-color: #93c5fd; }

    .pagination { display: flex; align-items: center; gap: .375rem; margin-top: 1rem; flex-wrap: wrap; }
    .pagination button { width: 2rem; height: 2rem; border: 1px solid #e2e8f0; border-radius: .375rem; background: white; cursor: pointer; font-size: .85rem; }
    .pagination button.active { background: #3b82f6; color: white; border-color: #3b82f6; }
    .pagination button:disabled { opacity: .4; cursor: not-allowed; }
    .page-info { font-size: .8rem; color: #64748b; margin-left: .5rem; }

    .btn { padding: .65rem 1.25rem; border-radius: .5rem; font-size: .9rem; font-weight: 600; cursor: pointer; border: none; }
    .btn-secondary { background: #f1f5f9; color: #374151; }
    .btn-success { background: #22c55e; color: white; }
    .btn-success:hover:not(:disabled) { background: #16a34a; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover:not(:disabled) { background: #dc2626; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 1rem; padding: 2rem; width: 100%; max-width: 480px; box-shadow: 0 25px 50px rgba(0,0,0,.3); }
    .modal-lg { max-width: 620px; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .modal-header h2 { margin: 0; font-size: 1.15rem; color: #1e293b; }
    .modal-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #64748b; }
    .modal-footer { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1.25rem; }

    .review-titre { font-weight: 600; color: #1e293b; margin: 0 0 1rem; font-size: .95rem; }
    .confirm-text { color: #475569; margin: 0 0 1rem; }
    .form-group { display: flex; flex-direction: column; gap: .4rem; margin-bottom: 1rem; }
    label { font-size: .875rem; font-weight: 600; color: #374151; }
    textarea { padding: .65rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem; font-size: .9rem; outline: none; width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
    textarea:focus { border-color: #3b82f6; }
    .alert { padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; margin-bottom: .75rem; }
    .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

    .detail-grid { display: flex; flex-direction: column; gap: .5rem; margin-bottom: 1rem; }
    .detail-row { display: flex; gap: .5rem; align-items: center; font-size: .9rem; color: #374151; }
    .detail-row strong { min-width: 90px; color: #1e293b; }
    .detail-full { font-size: .9rem; color: #374151; }
    .detail-full p { margin: .25rem 0 0; color: #475569; line-height: 1.6; }
    .detail-full.rejection { background: #fef2f2; border: 1px solid #fecaca; border-radius: .5rem; padding: .75rem; color: #991b1b; }
    .detail-full.rejection p { color: #7f1d1d; }
  `]
})
export class AdminMemoiresComponent implements OnInit {
  private memoireSvc = inject(MemoireService);

  memoires = signal<Memoire[]>([]);
  allMemoires = signal<Memoire[]>([]);
  loading = signal(true);
  acting = signal(false);
  page = signal(1);
  total = signal(0);
  private readonly pageSize = 10;

  searchTerm = '';
  statutFilter = '';
  selected = signal<Memoire | null>(null);
  reviewTarget = signal<Memoire | null>(null);
  reviewMode = signal<ReviewMode>('valider');
  noteRejet = '';
  reviewError = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.memoireSvc.getAll(this.page(), this.pageSize, this.searchTerm, this.statutFilter)
      .subscribe(res => {
        this.memoires.set(res.items);
        this.total.set(res.totalCount);
        this.loading.set(false);
      });
    // Load all (no pagination) for counters
    this.memoireSvc.getAll(1, 1000, '', '').subscribe(res => this.allMemoires.set(res.items));
  }

  onSearch() { this.page.set(1); this.load(); }

  goTo(p: number) { this.page.set(p); this.load(); }

  totalPages() { return Math.ceil(this.total() / this.pageSize) || 1; }

  pageNums() {
    const total = this.totalPages();
    const cur = this.page();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) pages.push(i);
    return pages;
  }

  countByStatut(s: string) {
    return this.allMemoires().filter(m => m.statut === s).length;
  }

  openReview(m: Memoire, mode: ReviewMode) {
    this.reviewTarget.set(m);
    this.reviewMode.set(mode);
    this.noteRejet = '';
    this.reviewError.set('');
  }

  doReview() {
    const m = this.reviewTarget();
    if (!m) return;

    if (this.reviewMode() === 'rejeter' && !this.noteRejet.trim()) {
      this.reviewError.set('Le motif du rejet est obligatoire.');
      return;
    }

    this.acting.set(true);
    const action = this.reviewMode() === 'valider'
      ? this.memoireSvc.valider(m.id)
      : this.memoireSvc.rejeter(m.id, this.noteRejet.trim());

    action.subscribe({
      next: () => { this.reviewTarget.set(null); this.acting.set(false); this.load(); },
      error: () => { this.reviewError.set('Erreur, veuillez réessayer.'); this.acting.set(false); }
    });
  }

  statutColor(s: string) {
    if (s === 'Valide') return 'green';
    if (s === 'Rejete') return 'red';
    return 'blue';
  }

  statutLabel(s: string) {
    if (s === 'Valide') return 'Validé';
    if (s === 'Rejete') return 'Rejeté';
    return 'Délivré';
  }

  statutIcon(s: string) {
    if (s === 'Valide') return 'fa-circle-check';
    if (s === 'Rejete') return 'fa-circle-xmark';
    return 'fa-clock';
  }
}
