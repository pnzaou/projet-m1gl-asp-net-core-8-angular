export type MemoireStatut = 'Delivre' | 'Valide' | 'Rejete';

export interface Memoire {
  id: string;
  titre: string;
  auteur: string;
  annee: number;
  specialite: string;
  description?: string;
  promoteur?: string;
  statut: MemoireStatut;
  noteRejet?: string;
  userId: string;
  userFullName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateMemoireDto {
  titre: string;
  auteur: string;
  annee: number;
  specialite: string;
  description?: string;
  promoteur?: string;
}
