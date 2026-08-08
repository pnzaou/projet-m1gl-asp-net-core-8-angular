# UserMgmt — Application Full-Stack

ASP.NET Core 8 · Angular 17 · PostgreSQL 16 · JWT · Serilog

## 🚀 Lancement rapide (Docker)

```bash
docker compose up --build -d
```

- **Application** : http://localhost
- **API Swagger** : http://localhost/api/swagger
- **Keycloak** : http://localhost/auth
- **Grafana** : http://localhost/grafana/
- **MinIO Console** : http://localhost:9001
- **Prometheus** : http://localhost:9090
- **PostgreSQL** : localhost:5433
- **Redis** : localhost:6379

## 🔐 Authentication (Keycloak)

L'authentification est déléguée à [Keycloak](http://localhost/auth), exposé par le gateway Nginx sous `/auth/`.

- **Console d'administration** : http://localhost/auth/admin — identifiants `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` définis dans `.env`.
- **Realm** : `usermgmt`, avec les rôles `User`, `Admin`, `SuperAdmin` et un utilisateur `superadmin@usermgmt.local` seedé à l'import.
- **Clients** : `usermgmt-frontend` (public, PKCE) pour l'app Angular, `usermgmt-backend` (confidentiel) pour l'API ASP.NET Core.
- **Découverte OIDC** : http://localhost/auth/realms/usermgmt/.well-known/openid-configuration
- **Attribution des rôles du compte de service backend** : le compte de service du client `usermgmt-backend` a besoin des rôles `manage-users` + `view-users` du client `realm-management` pour administrer les utilisateurs via l'API Admin de Keycloak. Il s'agit d'une opération d'exécution unique (non versionnée dans les fichiers du dépôt) — déjà effectuée pour cet environnement via l'API REST d'administration de Keycloak.

> Le backend et le frontend n'ont pas encore été branchés sur Keycloak (tâches suivantes) : les endpoints `/api/auth/*` et le flux JWT décrits plus bas dans ce README restent donc fonctionnels tels quels pour le moment.

## 🏗️ Architecture cible

Le dépôt est maintenant orienté vers une plateforme multi-services avec :
- un gateway Nginx pour router les appels,
- un service API ASP.NET Core,
- un service PostgreSQL,
- un service Redis pour la couche cache/session,
- MinIO pour le stockage de fichiers,
- Prometheus et Grafana pour l’observabilité.

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
