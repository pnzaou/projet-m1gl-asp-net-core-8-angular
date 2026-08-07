# Intégration Keycloak — Design

Date : 2026-08-07
Statut : Validé par l'utilisateur, en attente de plan d'implémentation

## Contexte

Le projet est un monolithe ASP.NET Core 8 (API unique) + Angular, exposé derrière une
gateway nginx, avec Postgres, Redis, MinIO, Prometheus/Grafana et Serilog déjà intégrés
(cf. `docker-compose.yml`, `gateway/nginx.conf`).

L'authentification est aujourd'hui gérée entièrement à la main dans le backend :
- `AuthController` (register/login/refresh/logout) + `TokenService` (JWT signé HMAC,
  clé symétrique dans `appsettings.json`/`.env`)
- Mots de passe hashés en BCrypt, stockés avec le profil dans `User` (Postgres)
- `UsersController` fait aussi office de CRUD admin (création avec mot de passe,
  changement de rôle, activation/désactivation, suppression), directement sur la table
- Le frontend Angular stocke les tokens en `localStorage` (`AuthService`) et a ses
  propres écrans `/auth/login` et `/auth/register`

Objectif : remplacer entièrement ce système par Keycloak comme fournisseur d'identité,
en conservant le reste de l'architecture (gateway, backend, frontend, observabilité)
inchangé.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Portée | Remplacement complet de l'auth maison (pas de coexistence transitoire) |
| Flow Angular | Redirection OIDC standard (Authorization Code + PKCE), pas de formulaire custom vers l'endpoint token |
| Données profil | Keycloak = identité/mot de passe/rôles ; Postgres garde une table `Users` allégée = profil (avatar, phone, department) liée au `sub` Keycloak |
| Panneau admin | Le backend pilote Keycloak via son Admin REST API (aucun changement d'UX Angular) |
| Lecture des rôles (liste admin) | Keycloak reste la source de vérité stricte à chaque lecture — pas de cache Redis des rôles, pour éviter toute désync |
| Comptes existants | Reset complet — pas de script de migration des comptes Postgres existants (contexte projet académique) |
| Thème de login | Thème Keycloak custom (`usermgmt`), reprenant la palette de l'app |

## Architecture cible

```
Navigateur
   │
   ▼
Gateway (nginx :80)
   ├── /            → web (Angular)
   ├── /api/        → api (.NET, valide les JWT Keycloak)
   ├── /auth/       → keycloak (realm usermgmt)
   ├── /grafana/    → grafana
   └── /minio/      → minio

Angular (keycloak-js/keycloak-angular)
   → redirige vers /auth/realms/usermgmt/protocol/openid-connect/auth (PKCE)
   → reçoit un access_token signé par Keycloak, l'attache aux appels /api/*

Backend .NET
   → valide les JWT via les clés publiques de Keycloak (JwtBearer, Authority interne)
   → provisionne un profil local au premier login
   → pilote Keycloak (Admin REST API, client "usermgmt-backend" en client-credentials)
     pour les opérations admin (créer/désactiver/supprimer/changer rôle)
```

## 1. Infrastructure Keycloak

**docker-compose.yml** — deux nouveaux services :
- `keycloak-db` : Postgres dédié (image `postgres:16-alpine`), isolé du Postgres
  applicatif, volume `keycloak_db_data`
- `keycloak` : image `quay.io/keycloak/keycloak:26.0`, commande
  `start-dev --import-realm`, variables :
  - `KC_DB=postgres`, `KC_DB_URL=jdbc:postgresql://keycloak-db:5432/keycloak`, credentials via `.env`
  - `KC_HTTP_RELATIVE_PATH=/auth`
  - `KC_PROXY=edge` (derrière nginx)
  - `KC_HOSTNAME` réglé sur l'URL publique (`http://localhost/auth` en dev)
  - `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` via `.env`
  - volumes : `./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json`
    et `./keycloak/themes/usermgmt:/opt/keycloak/themes/usermgmt`

**gateway/nginx.conf** — nouvelle route `location /auth/ { proxy_pass http://keycloak:8080/auth/; ... }`
avec les en-têtes `X-Forwarded-*` déjà utilisés pour les autres services (nécessaires à
Keycloak en mode `KC_PROXY=edge` pour générer des URLs correctes).

**Realm (`keycloak/realm-export.json`)**, importé automatiquement au premier démarrage :
- Realm `usermgmt`, `registrationAllowed: true`, `loginTheme: "usermgmt"`
- 3 realm roles : `User`, `Admin`, `SuperAdmin`
- Un utilisateur `superadmin@usermgmt.local` (mot de passe temporaire, `temporary: true`),
  rôle `SuperAdmin` — remplace le seed actuel de `Program.cs`
- Client public **`usermgmt-frontend`** : Standard Flow only, PKCE `S256` obligatoire,
  pas de secret, `redirectUris` = origines de la gateway, `webOrigins` = idem
- Client confidentiel **`usermgmt-backend`** : service account activé, rôles
  `manage-users` + `view-users` du client `realm-management`, utilisé pour :
  - valider les tokens (audience)
  - les appels Admin REST API depuis le backend
- Un mapper de client scope (rattaché au scope par défaut du realm, donc présent dans
  tous les tokens) : *User Realm Role* → claim `role` (multivalué) — permet à
  `ClaimTypes.Role` de fonctionner nativement côté ASP.NET Core sans code de mapping
  supplémentaire

**Point d'attention technique (double hostname)** : le token émis par Keycloak porte
comme `iss` l'URL *publique* (`http://localhost/auth/realms/usermgmt`), vue par le
navigateur. Le backend, lui, doit résoudre les clés de signature (JWKS) via le réseau
Docker interne (`http://keycloak:8080/auth/realms/usermgmt/...`). On sépare donc :
- `JwtBearerOptions.MetadataAddress` → URL interne (résolution des clés)
- `TokenValidationParameters.ValidIssuer` → URL publique (validation de `iss`)

## 2. Backend (.NET)

**Program.cs** :
- Suppression du bloc `AddJwtBearer` actuel (clé symétrique HMAC, `Jwt:Key/Issuer/Audience`)
- Nouveau bloc `AddJwtBearer` : `MetadataAddress` interne, `ValidIssuer` public,
  `ValidAudience = "usermgmt-backend"`, `RequireHttpsMetadata = false` (dev)
- Suppression du seed `SuperAdmin` en base (remplacé par le realm import Keycloak)
- Ajout d'un middleware après `UseAuthentication()` qui appelle
  `IUserProfileService.EnsureProfileAsync(claimsPrincipal)`

**Suppression** : `AuthController.cs`, `TokenService.cs`, `AuthResponseDto`,
`RefreshTokenDto`, `LoginDto`, `RegisterDto` (DTOs devenus inutiles)

**Models/User.cs** — devient un profil : retrait de `PasswordHash`, `Role`,
`RefreshToken`, `RefreshTokenExpiry`. Champs conservés : `Id` (= `sub` Keycloak, `Guid`),
`FirstName`, `LastName`, `Email`, `AvatarUrl`, `Phone`, `Department`, `CreatedAt`,
`UpdatedAt`. Nouvelle migration EF Core (`DropColumn` sur les champs retirés).

**Services/UserProfileService.cs** (nouveau) : `EnsureProfileAsync(ClaimsPrincipal)` —
upsert la ligne `Users` à partir des claims `sub`/`email`/`given_name`/`family_name` si
elle n'existe pas encore. Appelé à chaque requête authentifiée (idempotent, coût
négligeable — un `FindAsync` par requête, comme aujourd'hui pour `GetMe`).

**Services/KeycloakAdminService.cs** (nouveau) — `IKeycloakAdminService`, `HttpClient`
nommé authentifié via client-credentials (`usermgmt-backend`), méthodes :
- `CreateUserAsync(email, firstName, lastName, tempPassword, role)`
- `SetRoleAsync(userId, role)` (retire l'ancien rôle réalm, assigne le nouveau)
- `SetEnabledAsync(userId, enabled)`
- `DeleteUserAsync(userId)`
- `GetRoleAsync(userId)` / `GetRolesBulkAsync(userIds)` (pour la liste admin)

**UsersController.cs** — refonte des endpoints admin :
- `Create` → `KeycloakAdminService.CreateUserAsync` puis crée la ligne de profil local
- `SetRole` → `KeycloakAdminService.SetRoleAsync`
- `ToggleActive` → `KeycloakAdminService.SetEnabledAsync`
- `Delete` → `KeycloakAdminService.DeleteUserAsync` puis supprime la ligne de profil local
- `GetAll`/`GetById`/`Stats` → lisent le profil local pour les champs applicatifs,
  interrogent Keycloak (`GetRolesBulkAsync`) pour le rôle et le statut `enabled` à
  chaque appel (source de vérité stricte, pas de cache)
- `ChangePassword` (self-service) → supprimé ; le changement de mot de passe se fait
  via l'écran "Account" de Keycloak (lien exposé dans le profil Angular)

## 3. Frontend (Angular)

**Dépendances** : `keycloak-js`, `keycloak-angular`.

**Bootstrap** (`app.config.ts`) : configuration Keycloak (`url: '/auth'`,
`realm: 'usermgmt'`, `clientId: 'usermgmt-frontend'`), init avec
`pkceMethod: 'S256'`, `onLoad: 'check-sso'` (pas de redirection forcée à l'ouverture,
seulement sur action explicite ou route protégée).

**Suppression** : `features/auth/login/`, `features/auth/register/`, `auth.routes.ts`,
et toute la logique `localStorage`/`storeSession` dans `AuthService`.

**AuthService (refonte)** — devient un wrapper fin :
- `login()` → `keycloakService.login()`
- `logout()` → `keycloakService.logout()`
- `isLoggedIn`/`isAdmin`/`isSuperAdmin` → dérivés de `keycloakService.getKeycloakInstance().realmAccess.roles`
- `currentUser` (profil applicatif) → chargé via `GET /api/users/me` après login réussi
  (le backend fait le provisioning et renvoie le profil)

**auth.interceptor.ts** → remplacé par l'intercepteur bearer fourni par
`keycloak-angular`, qui attache le token courant et gère le refresh silencieux.

**auth.guard.ts** → remplacé par le guard `keycloak-angular` (rôles requis déclarés par
route via les `data` de route).

**Inscription** : gérée nativement par l'écran Keycloak (`registrationAllowed: true`),
plus d'écran Angular dédié.

## 4. Thème Keycloak custom

`keycloak/themes/usermgmt/login/` :
- `theme.properties` : `parent=keycloak.v2`, `import=common/keycloak`
- `resources/css/styles.css` : override des variables de couleur pour matcher la
  palette Angular — fond `#f8fafc`, texte `#1e293b`, bouton primaire `#3b82f6`
  (hover `#2563eb`), erreurs `#dc2626`/`#fef2f2`
- `resources/img/logo.svg` : logo de l'app à la place du logo Keycloak par défaut
- Activé via `loginTheme: "usermgmt"` dans `realm-export.json`
- Scope limité à l'écran login/register ; thèmes email/admin/account restent par défaut

## Variables d'environnement (.env / .env.example)

Ajout : `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_DB_PASSWORD`,
`KEYCLOAK_BACKEND_CLIENT_SECRET`.
Retrait : `JWT_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE` (obsolètes).

## Tests / validation

- `docker compose up` → Keycloak importe le realm, `superadmin@usermgmt.local` peut se
  connecter sur `/auth/realms/usermgmt/account`
- Login Angular → redirection Keycloak → retour avec session active → `GET /api/users/me`
  renvoie un profil auto-provisionné
- Panneau admin : créer un utilisateur, changer son rôle, le désactiver, le supprimer →
  vérifier dans la console Keycloak que les changements sont bien reflétés
- Un utilisateur avec le rôle `User` reçoit bien 403 sur les endpoints `[Authorize(Roles = "Admin,SuperAdmin")]`
- Redémarrage du conteneur `api` sans redémarrer Keycloak → les tokens existants restent valides (clés JWKS stables)

## Hors scope

- Migration des comptes Postgres existants vers Keycloak
- Thème custom des écrans email/admin console/account
- SSO avec d'autres applications, fédération d'identité externe (Google, LDAP, etc.)
- Cache Redis des rôles (explicitement écarté au profit de Keycloak comme source stricte)
