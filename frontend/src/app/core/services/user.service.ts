import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DashboardStats, PagedResult, User } from '../../shared/models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly API = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  // Profil
  getMe() { return this.http.get<User>(`${this.API}/me`); }
  updateMe(data: any) { return this.http.put<User>(`${this.API}/me`, data); }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put(`${this.API}/me/password`, { currentPassword, newPassword });
  }

  // Admin CRUD
  getAll(page = 1, pageSize = 10, search = '', role = '', isActive?: boolean) {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('search', search)
      .set('role', role);
    if (isActive !== undefined) params = params.set('isActive', isActive);
    return this.http.get<PagedResult<User>>(this.API, { params });
  }

  create(data: any) { return this.http.post<User>(this.API, data); }
  update(id: string, data: any) { return this.http.put<User>(`${this.API}/${id}`, data); }
  toggleActive(id: string) { return this.http.patch(`${this.API}/${id}/toggle-active`, {}); }
  delete(id: string) { return this.http.delete(`${this.API}/${id}`); }
  getStats() { return this.http.get<DashboardStats>(`${this.API}/stats`); }
}
