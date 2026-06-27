import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CreateMemoireDto, Memoire } from '../../shared/models/memoire.model';
import { PagedResult } from '../../shared/models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MemoireService {
  private readonly API = `${environment.apiUrl}/memoires`;

  constructor(private http: HttpClient) {}

  create(dto: CreateMemoireDto) {
    return this.http.post<Memoire>(this.API, dto);
  }

  getMine() {
    return this.http.get<Memoire[]>(`${this.API}/mine`);
  }

  getAll(page = 1, pageSize = 10, search = '', statut = '') {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('search', search)
      .set('statut', statut);
    return this.http.get<PagedResult<Memoire>>(this.API, { params });
  }

  valider(id: string) {
    return this.http.patch(`${this.API}/${id}/valider`, {});
  }

  rejeter(id: string, noteRejet: string) {
    return this.http.patch(`${this.API}/${id}/rejeter`, { noteRejet });
  }

  delete(id: string) {
    return this.http.delete(`${this.API}/${id}`);
  }
}
