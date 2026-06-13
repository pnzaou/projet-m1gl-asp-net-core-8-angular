# UserMgmt — Application Full-Stack

ASP.NET Core 8 · Angular 17 · PostgreSQL 16 · JWT · Serilog

## 🚀 Lancement rapide (Docker)

```bash
docker-compose up --build -d
```

- **Frontend** : http://localhost
- **API Swagger** : http://localhost:5000/swagger
- **PostgreSQL** : localhost:5432

## 🔑 Promouvoir un utilisateur en Admin

```bash
docker exec -it usermgmt_db psql -U postgres -d usermgmt \
  -c "UPDATE \"Users\" SET \"Role\" = 'Admin' WHERE \"Email\" = 'votre@email.com';"
```

## 💻 Développement local

### Backend
```bash
cd backend
dotnet restore
dotnet ef migrations add Init
dotnet ef database update
dotnet run
```

### Frontend
```bash
cd frontend
npm install
ng serve
```

## 📁 Structure

```
project/
├── backend/
│   ├── Controllers/       # AuthController, UsersController
│   ├── DTOs/              # Records C# (Auth, User, Pagination)
│   ├── Infrastructure/    # AppDbContext (EF Core + PostgreSQL)
│   ├── Models/            # Entité User
│   ├── Services/          # TokenService (JWT)
│   ├── Program.cs         # Bootstrap (Serilog, JWT, CORS, Swagger)
│   └── appsettings.json
├── frontend/
│   └── src/app/
│       ├── core/
│       │   ├── guards/       # authGuard, guestGuard, adminGuard
│       │   ├── interceptors/ # Injection Bearer + auto-refresh JWT
│       │   └── services/     # AuthService, UserService
│       ├── features/
│       │   ├── auth/         # Login, Register
│       │   ├── dashboard/    # Stats (Admin) + actions rapides
│       │   ├── users/        # Table CRUD paginée + modales
│       │   ├── profile/      # Profil + changement mot de passe
│       │   └── admin/        # Stats avancées + export CSV
│       └── shared/
│           ├── components/shell/  # Sidebar + navigation
│           └── models/            # Interfaces TypeScript
├── docker-compose.yml
└── README.md
```

## 🔐 Sécurité

- Mots de passe hashés avec BCrypt
- JWT avec access token (1h) + refresh token (7j)
- Refresh automatique côté Angular (intercepteur HTTP)
- Guards Angular : authGuard, guestGuard, adminGuard
- Endpoints Admin protégés par `[Authorize(Roles = "Admin")]`

## 📊 API Endpoints

| Méthode | Endpoint | Rôle |
|---------|----------|------|
| POST | /api/auth/register | Public |
| POST | /api/auth/login | Public |
| POST | /api/auth/refresh | Public |
| POST | /api/auth/logout | Public |
| GET | /api/users/me | Authentifié |
| PUT | /api/users/me | Authentifié |
| PUT | /api/users/me/password | Authentifié |
| GET | /api/users | Admin |
| POST | /api/users | Admin |
| PUT | /api/users/{id} | Admin |
| PATCH | /api/users/{id}/toggle-active | Admin |
| DELETE | /api/users/{id} | Admin |
| GET | /api/users/stats | Admin |
