import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { MemoireService } from '../../core/services/memoire.service';
import { Memoire } from '../../shared/models/memoire.model';

@Component({
  selector: 'app-memoires',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
<div class="page">
  <div class="page-header">
    <div>
      <h1><i class="fa-solid fa-book-open"></i> Mes mémoires</h1>
      <p class="subtitle">Soumettez et suivez l'état de vos mémoires</p>
    </div>
    <button class="btn btn-primary" (click)="showForm.set(!showForm())">
      @if (showForm()) { <i class="fa-solid fa-xmark"></i> Annuler } @else { <i class="fa-solid fa-plus"></i> Nouveau mémoire }
    </button>
  </div>

  <!-- Formulaire de soumission ─────────────────────────────────────────── -->
  @if (showForm()) {
    <div class="card form-card">
      <h2>Soumettre un mémoire</h2>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        @if (formError()) {
          <div class="alert alert-error">{{ formError() }}</div>
        }
        <div class="form-row">
          <div class="form-group">
            <label>Titre *</label>
            <input formControlName="titre" placeholder="Titre complet du mémoire" />
          </div>
          <div class="form-group">
            <label>Auteur *</label>
            <input formControlName="auteur" placeholder="Nom et prénom de l'auteur" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Spécialité *</label>
            <input formControlName="specialite" placeholder="Génie Logiciel, IA, Réseaux..." />
          </div>
          <div class="form-group">
            <label>Année *</label>
            <input type="number" formControlName="annee" [min]="2000" [max]="currentYear + 1" />
          </div>
        </div>
        <div class="form-group">
          <label>Promoteur / Encadreur</label>
          <input formControlName="promoteur" placeholder="Nom du promoteur (optionnel)" />
        </div>
        <div class="form-group">
          <label>Résumé</label>
          <textarea formControlName="description" rows="4" placeholder="Résumé du mémoire (optionnel)"></textarea>
        </div>
        <div class="form-footer">
          <button type="button" class="btn btn-secondary" (click)="showForm.set(false)">Annuler</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Envoi...' : 'Soumettre le mémoire' }}
          </button>
        </div>
      </form>
    </div>
  }

  <!-- Liste des mémoires ──────────────────────────────────────────────── -->
  @if (loading()) {
    <div class="loading">Chargement de vos mémoires...</div>
  } @else if (memoires().length === 0) {
    <div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-file-lines"></i></div>
      <p>Vous n'avez pas encore soumis de mémoire.</p>
      <button class="btn btn-primary" (click)="showForm.set(true)">Soumettre mon premier mémoire</button>
    </div>
  } @else {
    <div class="memoires-list">
      @for (m of memoires(); track m.id) {
        <div class="memoire-card" [class]="'border-' + statutColor(m.statut)">
          <div class="memoire-header">
            <div class="memoire-meta">
              <span class="badge" [class]="'badge-' + statutColor(m.statut)">
                <i class="fa-solid" [class]="statutIcon(m.statut)"></i> {{ statutLabel(m.statut) }}
              </span>
              <span class="annee">{{ m.annee }}</span>
            </div>
            <button class="btn-icon btn-danger" title="Supprimer" (click)="confirmDelete(m)"
              [disabled]="m.statut === 'Valide'"><i class="fa-solid fa-trash"></i></button>
          </div>
          <h3 class="memoire-titre">{{ m.titre }}</h3>
          <div class="memoire-info">
            <span><i class="fa-solid fa-user"></i> {{ m.auteur }}</span>
            @if (m.promoteur) { <span><i class="fa-solid fa-graduation-cap"></i> {{ m.promoteur }}</span> }
            <span><i class="fa-solid fa-folder"></i> {{ m.specialite }}</span>
          </div>
          @if (m.description) {
            <p class="memoire-desc">{{ m.description }}</p>
          }
          @if (m.statut === 'Rejete' && m.noteRejet) {
            <div class="rejection-note">
              <strong><i class="fa-solid fa-circle-xmark"></i> Motif du rejet :</strong>
              <p>{{ m.noteRejet }}</p>
            </div>
          }
          <div class="memoire-date">
            Soumis le {{ m.createdAt | date:'dd/MM/yyyy à HH:mm' }}
            @if (m.updatedAt) { · Mis à jour le {{ m.updatedAt | date:'dd/MM/yyyy' }} }
          </div>
        </div>
      }
    </div>
  }
</div>

<!-- Confirm delete ───────────────────────────────────────────────────────── -->
@if (deleteTarget()) {
  <div class="modal-overlay" (click)="deleteTarget.set(null)">
    <div class="modal" (click)="$event.stopPropagation()">
      <h2>Supprimer ce mémoire ?</h2>
      <p>Le mémoire <strong>{{ deleteTarget()!.titre }}</strong> sera définitivement supprimé.</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" (click)="deleteTarget.set(null)">Annuler</button>
        <button class="btn btn-danger" (click)="doDelete()">Supprimer</button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    .page { max-width: 900px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; margin: 0 0 .25rem; }
    .subtitle { color: #64748b; margin: 0; }

    .btn { padding: .65rem 1.25rem; border-radius: .5rem; font-size: .9rem; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    .btn-secondary { background: #f1f5f9; color: #374151; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-icon { background: none; border: 1px solid #e5e7eb; border-radius: .375rem; padding: .3rem .5rem; cursor: pointer; font-size: .9rem; }
    .btn-icon:disabled { opacity: .4; cursor: not-allowed; }
    .btn-icon.btn-danger:hover:not(:disabled) { background: #fef2f2; border-color: #fecaca; }

    .card { background: white; border-radius: .75rem; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin-bottom: 2rem; }
    .form-card h2 { font-size: 1.15rem; font-weight: 700; color: #1e293b; margin: 0 0 1.5rem; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: .4rem; margin-bottom: 1rem; }
    label { font-size: .875rem; font-weight: 600; color: #374151; }
    input, textarea {
      padding: .65rem 1rem; border: 2px solid #e5e7eb; border-radius: .5rem;
      font-size: .9rem; outline: none; width: 100%; box-sizing: border-box;
    }
    input:focus, textarea:focus { border-color: #3b82f6; }
    textarea { resize: vertical; font-family: inherit; }
    .form-footer { display: flex; gap: .75rem; justify-content: flex-end; margin-top: .5rem; }
    .alert { padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; margin-bottom: 1rem; }
    .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

    .loading { color: #64748b; padding: 2rem; text-align: center; }

    .empty-state {
      background: white; border-radius: .75rem; padding: 4rem 2rem;
      text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1);
    }
    .empty-icon { font-size: 3.5rem; color: #cbd5e1; margin-bottom: 1rem; }
    .empty-state p { color: #64748b; margin: 0 0 1.5rem; }

    .memoires-list { display: flex; flex-direction: column; gap: 1rem; }
    .memoire-card {
      background: white; border-radius: .75rem; padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.1); border-left: 4px solid #e2e8f0;
    }
    .border-blue { border-left-color: #3b82f6; }
    .border-green { border-left-color: #22c55e; }
    .border-red { border-left-color: #ef4444; }

    .memoire-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
    .memoire-meta { display: flex; align-items: center; gap: .75rem; }
    .annee { font-size: .8rem; color: #64748b; background: #f1f5f9; padding: .2rem .5rem; border-radius: .25rem; }

    .badge { padding: .25rem .65rem; border-radius: 9999px; font-size: .75rem; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }

    .memoire-titre { font-size: 1.05rem; font-weight: 700; color: #1e293b; margin: 0 0 .5rem; }
    .memoire-info { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .85rem; color: #64748b; margin-bottom: .5rem; }
    .memoire-desc { font-size: .875rem; color: #475569; margin: .5rem 0 0; line-height: 1.6; }

    .rejection-note {
      margin-top: .75rem; padding: .75rem 1rem; background: #fef2f2;
      border: 1px solid #fecaca; border-radius: .5rem; font-size: .875rem;
    }
    .rejection-note strong { color: #dc2626; display: block; margin-bottom: .25rem; }
    .rejection-note p { color: #7f1d1d; margin: 0; }

    .memoire-date { font-size: .78rem; color: #94a3b8; margin-top: .75rem; }

    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.5);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal {
      background: white; border-radius: 1rem; padding: 2rem;
      width: 100%; max-width: 420px; box-shadow: 0 25px 50px rgba(0,0,0,.3);
    }
    .modal h2 { margin: 0 0 .75rem; font-size: 1.15rem; color: #1e293b; }
    .modal p { color: #475569; margin: 0 0 1.5rem; }
    .modal-footer { display: flex; gap: .75rem; justify-content: flex-end; }
  `]
})
export class MemoiresComponent implements OnInit {
  auth = inject(AuthService);
  private memoireSvc = inject(MemoireService);
  private fb = inject(FormBuilder);

  memoires = signal<Memoire[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  formError = signal('');
  deleteTarget = signal<Memoire | null>(null);
  currentYear = new Date().getFullYear();

  form = this.fb.group({
    titre: ['', Validators.required],
    auteur: ['', Validators.required],
    annee: [this.currentYear, [Validators.required, Validators.min(2000)]],
    specialite: ['', Validators.required],
    promoteur: [''],
    description: ['']
  });

  ngOnInit() {
    this.loadMine();
  }

  loadMine() {
    this.loading.set(true);
    this.memoireSvc.getMine().subscribe({
      next: items => { this.memoires.set(items); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.formError.set('');
    const v = this.form.value;
    this.memoireSvc.create({
      titre: v.titre!, auteur: v.auteur!, annee: v.annee!,
      specialite: v.specialite!, promoteur: v.promoteur || undefined,
      description: v.description || undefined
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.form.reset({ annee: this.currentYear });
        this.loadMine();
      },
      error: (e) => {
        this.formError.set(e.error?.message ?? 'Erreur lors de la soumission');
        this.saving.set(false);
      }
    });
  }

  confirmDelete(m: Memoire) { this.deleteTarget.set(m); }

  doDelete() {
    const m = this.deleteTarget();
    if (!m) return;
    this.memoireSvc.delete(m.id).subscribe(() => {
      this.deleteTarget.set(null);
      this.loadMine();
    });
  }

  statutColor(statut: string) {
    if (statut === 'Valide') return 'green';
    if (statut === 'Rejete') return 'red';
    return 'blue';
  }

  statutLabel(statut: string) {
    if (statut === 'Valide') return 'Validé';
    if (statut === 'Rejete') return 'Rejeté';
    return 'Délivré';
  }

  statutIcon(statut: string) {
    if (statut === 'Valide') return 'fa-circle-check';
    if (statut === 'Rejete') return 'fa-circle-xmark';
    return 'fa-clock';
  }
}
