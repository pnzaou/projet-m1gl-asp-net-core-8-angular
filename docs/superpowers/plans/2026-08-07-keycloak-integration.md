# Keycloak Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled JWT auth system (BCrypt + custom TokenService) with Keycloak as the identity provider, across the gateway, backend, and frontend, per `docs/superpowers/specs/2026-08-07-keycloak-integration-design.md`.

**Architecture:** Keycloak + a dedicated Postgres run as two new docker-compose services, reachable only through the existing nginx gateway at `/auth/` (no separate published port, to avoid a dual-issuer mismatch between dev and prod). The backend validates Keycloak-issued JWTs (`role` claim mapped to `ClaimTypes.Role`) and drives Keycloak's Admin REST API for user management instead of touching password/role columns directly. Angular authenticates via OIDC Authorization Code + PKCE using `keycloak-angular`/`keycloak-js`.

**Tech Stack:** Keycloak 26 (Docker, `start-dev --import-realm`), Postgres 16, ASP.NET Core 8 `JwtBearer`, Angular 17 + `keycloak-angular` + `keycloak-js`, nginx.

## Global Constraints

- Full replacement of the custom auth system — no transitional coexistence.
- Angular authenticates via OIDC redirect (Authorization Code + PKCE), not a custom login form hitting the token endpoint.
- `Users` table becomes a profile table only (no password/role/refresh-token columns); Keycloak is the identity/role source of truth.
- Admin user management (create/role/enable/delete) goes through Keycloak's Admin REST API from the backend — no direct DB writes to identity fields.
- No Redis caching of roles: every read that needs a role/enabled status calls Keycloak directly.
- Existing Postgres accounts are reset, not migrated — the realm import seeds a fresh `superadmin@usermgmt.local`.
- Custom Keycloak theme is scoped to the login/register screen only.
- **No automated test suite exists in this repo today** (no backend test project, no Angular spec files). This plan does not introduce one as a side effect — each task's "verify" step is a concrete manual check (`curl`, `docker compose logs`, browser step) instead of a unit/integration test, matching the codebase's current conventions. If you want a test suite added, that should be its own follow-up plan.

---

### Task 1: Add Keycloak and its database to docker-compose, wire environment variables

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env`
- Modify: `.env.example`

**Interfaces:**
- Produces: `keycloak` service reachable inside the `usermgmt-network` at `http://keycloak:8080/auth`; `keycloak-db` service at `keycloak-db:5432`; env vars `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_REALM`, `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_BACKEND_CLIENT_SECRET` consumed by later tasks.

- [ ] **Step 1: Update `.env.example`**

Remove the `JWT_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE` lines and add:

```
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KEYCLOAK_DB_PASSWORD=keycloak_secret
KEYCLOAK_REALM=usermgmt
KEYCLOAK_PUBLIC_URL=http://localhost/auth
KEYCLOAK_BACKEND_CLIENT_SECRET=usermgmt-backend-secret
```

- [ ] **Step 2: Apply the same edit to `.env`**

Mirror step 1 in `.env` (this is the file docker-compose actually reads). Keep the same values as `.env.example` for local dev — they only need to match the secret baked into `keycloak/realm-export.json` in Task 2.

- [ ] **Step 3: Add `keycloak-db` and `keycloak` services to `docker-compose.yml`**

Add after the `minio` service:

```yaml
  keycloak-db:
    image: postgres:16-alpine
    container_name: usermgmt_keycloak_db
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ${KEYCLOAK_DB_PASSWORD:-keycloak_secret}
    volumes:
      - keycloak_db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - usermgmt-network

  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    container_name: usermgmt_keycloak
    command: ["start-dev", "--import-realm"]
    environment:
      KC_DB: postgres
      KC_DB_URL: "jdbc:postgresql://keycloak-db:5432/keycloak"
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KEYCLOAK_DB_PASSWORD:-keycloak_secret}
      KC_HOSTNAME: ${KEYCLOAK_PUBLIC_URL:-http://localhost/auth}
      KC_HTTP_RELATIVE_PATH: /auth
      KC_PROXY: edge
      KC_HTTP_ENABLED: "true"
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}
    volumes:
      - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json:ro
      - ./keycloak/themes/usermgmt:/opt/keycloak/themes/usermgmt:ro
    depends_on:
      keycloak-db:
        condition: service_healthy
    networks:
      - usermgmt-network
```

Note there is deliberately no `ports:` entry — Keycloak is only reachable via the gateway (Task 4), which keeps a single hostname/issuer for tokens.

- [ ] **Step 4: Point the `api` service at Keycloak instead of the local JWT config**

In the `api` service's `environment:` block, remove:

```yaml
      Jwt__Key: ${JWT_KEY:-super-secret-key-minimum-32-characters!!}
      Jwt__Issuer: ${JWT_ISSUER:-usermgmt-api}
      Jwt__Audience: ${JWT_AUDIENCE:-usermgmt-client}
```

and add:

```yaml
      Keycloak__PublicAuthority: "${KEYCLOAK_PUBLIC_URL:-http://localhost/auth}/realms/${KEYCLOAK_REALM:-usermgmt}"
      Keycloak__InternalMetadataAddress: "http://keycloak:8080/auth/realms/${KEYCLOAK_REALM:-usermgmt}/.well-known/openid-configuration"
      Keycloak__Audience: usermgmt-backend
      Keycloak__Realm: "${KEYCLOAK_REALM:-usermgmt}"
      Keycloak__AdminBaseUrl: "http://keycloak:8080/auth/"
      Keycloak__AdminClientId: usermgmt-backend
      Keycloak__AdminClientSecret: "${KEYCLOAK_BACKEND_CLIENT_SECRET:-usermgmt-backend-secret}"
```

Add `keycloak` to the `api` service's `depends_on`:

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
      keycloak:
        condition: service_started
```

- [ ] **Step 5: Add `keycloak_db_data` to the top-level `volumes:` block**

```yaml
volumes:
  pg_data:
  redis_data:
  minio_data:
  prometheus_data:
  grafana_data:
  keycloak_db_data:
```

- [ ] **Step 6: Verify the compose file parses**

Run: `docker compose config --quiet`
Expected: no output, exit code 0. (Do not `docker compose up` yet — Task 2 and 4 still need to land first.)

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env .env.example
git commit -m "infra: add keycloak and keycloak-db services to docker-compose"
```

---

### Task 2: Create the Keycloak realm export (realm, roles, clients, seed SuperAdmin)

**Files:**
- Create: `keycloak/realm-export.json`

**Interfaces:**
- Produces: realm `usermgmt` with realm roles `User`/`Admin`/`SuperAdmin`; client `usermgmt-frontend` (public, PKCE); client `usermgmt-backend` (confidential, service account, secret `usermgmt-backend-secret` — must match `KEYCLOAK_BACKEND_CLIENT_SECRET` from Task 1); a `role` claim mapper and an `usermgmt-backend` audience mapper on the access token; seeded user `superadmin@usermgmt.local` / `SuperAdmin@123` (temporary password) with role `SuperAdmin`.

- [ ] **Step 1: Write `keycloak/realm-export.json`**

```json
{
  "realm": "usermgmt",
  "enabled": true,
  "sslRequired": "none",
  "registrationAllowed": true,
  "registrationEmailAsUsername": true,
  "loginTheme": "usermgmt",
  "accessTokenLifespan": 3600,
  "roles": {
    "realm": [
      { "name": "User", "description": "Utilisateur standard" },
      { "name": "Admin", "description": "Administrateur" },
      { "name": "SuperAdmin", "description": "Super administrateur" }
    ]
  },
  "users": [
    {
      "username": "superadmin@usermgmt.local",
      "email": "superadmin@usermgmt.local",
      "enabled": true,
      "emailVerified": true,
      "firstName": "Super",
      "lastName": "Admin",
      "credentials": [
        { "type": "password", "value": "SuperAdmin@123", "temporary": true }
      ],
      "realmRoles": ["SuperAdmin"]
    }
  ],
  "clients": [
    {
      "clientId": "usermgmt-frontend",
      "enabled": true,
      "publicClient": true,
      "protocol": "openid-connect",
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": false,
      "redirectUris": ["http://localhost/*", "http://localhost:4200/*"],
      "webOrigins": ["http://localhost", "http://localhost:4200"],
      "attributes": {
        "pkce.code.challenge.method": "S256"
      },
      "protocolMappers": [
        {
          "name": "realm-roles-as-role-claim",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-realm-role-mapper",
          "consentRequired": false,
          "config": {
            "multivalued": "true",
            "user.attribute": "foo",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
            "claim.name": "role",
            "jsonType.label": "String"
          }
        },
        {
          "name": "usermgmt-backend-audience",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-audience-mapper",
          "consentRequired": false,
          "config": {
            "included.client.audience": "usermgmt-backend",
            "id.token.claim": "false",
            "access.token.claim": "true"
          }
        }
      ]
    },
    {
      "clientId": "usermgmt-backend",
      "enabled": true,
      "publicClient": false,
      "secret": "usermgmt-backend-secret",
      "protocol": "openid-connect",
      "standardFlowEnabled": false,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": true
    }
  ]
}
```

- [ ] **Step 2: Grant the backend service account permission to manage users**

The `serviceAccountsEnabled: true` client above gets its service-account user created automatically by Keycloak on import, but it still needs the `realm-management` client roles `manage-users` and `view-users` assigned to that service account. Realm-export JSON can express this by adding a `users` entry for the service account, but the safer, less error-prone path for a JSON you're hand-writing is to do this assignment once through the admin console after first import — add a step here as a manual one-time action, not code:

After `docker compose up` succeeds (Task 4), open `http://localhost/auth/admin` (login `admin`/`admin` from `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD`), go to realm `usermgmt` → Clients → `usermgmt-backend` → Service accounts roles → Assign role → filter by clients → `realm-management` → select `manage-users` and `view-users` → Assign. Note this as a required manual setup step in the Task 4 verification checklist and in the project README (Task 4 will update the README).

- [ ] **Step 3: Commit**

```bash
git add keycloak/realm-export.json
git commit -m "infra: add Keycloak realm export (roles, clients, seeded superadmin)"
```

---

### Task 3: Create a custom Keycloak login theme

**Files:**
- Create: `keycloak/themes/usermgmt/login/theme.properties`
- Create: `keycloak/themes/usermgmt/login/resources/css/styles.css`
- Create: `keycloak/themes/usermgmt/login/resources/img/logo.svg`

**Interfaces:**
- Produces: theme `usermgmt`, activated by `loginTheme: "usermgmt"` already set in `keycloak/realm-export.json` (Task 2).

- [ ] **Step 1: Write `theme.properties`**

```properties
parent=keycloak.v2
import=common/keycloak

styles=css/styles.css

meta.viewport=width=device-width,initial-scale=1
```

- [ ] **Step 2: Write `resources/css/styles.css`**

```css
:root {
  --um-bg: #f8fafc;
  --um-text: #1e293b;
  --um-muted: #64748b;
  --um-primary: #3b82f6;
  --um-primary-hover: #2563eb;
  --um-error-bg: #fef2f2;
  --um-error-text: #dc2626;
  --um-error-border: #fecaca;
}

body {
  background: var(--um-bg) !important;
  color: var(--um-text) !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}

#kc-header-wrapper,
.login-pf-header h1 {
  color: var(--um-text) !important;
}

.login-pf-page-header .kc-logo-text,
#kc-logo {
  background-image: url('../img/logo.svg') !important;
  background-repeat: no-repeat;
  background-position: center;
  width: 3rem;
  height: 3rem;
  margin: 0 auto 1rem;
}

.card-pf,
#kc-form-wrapper {
  background: white !important;
  border-radius: .75rem !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .1) !important;
}

.btn-primary,
input[type="submit"] {
  background-color: var(--um-primary) !important;
  border-color: var(--um-primary) !important;
}

.btn-primary:hover,
input[type="submit"]:hover {
  background-color: var(--um-primary-hover) !important;
  border-color: var(--um-primary-hover) !important;
}

.pf-c-form-control:focus,
input[type="text"]:focus,
input[type="password"]:focus,
input[type="email"]:focus {
  border-color: var(--um-primary) !important;
  box-shadow: none !important;
}

.alert-error,
.pf-m-error {
  background: var(--um-error-bg) !important;
  color: var(--um-error-text) !important;
  border-color: var(--um-error-border) !important;
}

.link,
a {
  color: var(--um-primary) !important;
}
```

- [ ] **Step 3: Write `resources/img/logo.svg`**

A simple monogram matching the sidebar branding ("MémoireSys", see `frontend/src/app/shared/components/shell/shell.component.ts`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <rect width="48" height="48" rx="10" fill="#3b82f6"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="white">M</text>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add keycloak/themes
git commit -m "infra: add custom usermgmt Keycloak login theme"
```

(Visual verification of the theme happens in Task 4's end-to-end check, once the full stack is up.)

---

### Task 4: Expose Keycloak through the gateway and bring up the full infra stack

**Files:**
- Modify: `gateway/nginx.conf`
- Modify: `README.md` (document the one-time service-account role assignment from Task 2, and drop any docs referencing the old JWT env vars)

**Interfaces:**
- Consumes: `keycloak` service from Task 1, running on `keycloak:8080` with `KC_HTTP_RELATIVE_PATH=/auth`.
- Produces: `http://localhost/auth/realms/usermgmt/.well-known/openid-configuration` reachable from the host browser through the gateway.

- [ ] **Step 1: Add the Keycloak upstream and route to `gateway/nginx.conf`**

Add the upstream next to the existing ones:

```nginx
    upstream keycloak_upstream {
        server keycloak:8080;
    }
```

Add the location block (order it before `location /` so it isn't swallowed by the catch-all):

```nginx
        location /auth/ {
            proxy_pass http://keycloak_upstream;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
```

- [ ] **Step 2: Add `keycloak` to the `gateway` service's `depends_on` in `docker-compose.yml`**

```yaml
  gateway:
    ...
    depends_on:
      - api
      - web
      - grafana
      - minio
      - keycloak
```

- [ ] **Step 3: Bring up the full stack**

Run: `docker compose up -d --build`
Then: `docker compose logs keycloak --tail 50`
Expected: log lines showing the realm `usermgmt` was imported, no `ERROR` lines about the import failing.

- [ ] **Step 4: Verify Keycloak is reachable through the gateway**

Run: `curl -s http://localhost/auth/realms/usermgmt/.well-known/openid-configuration`
Expected: a JSON document containing `"issuer":"http://localhost/auth/realms/usermgmt"`. If the issuer doesn't match, check `KC_HOSTNAME` in `docker-compose.yml` (Task 1, Step 3) matches `KEYCLOAK_PUBLIC_URL` exactly.

- [ ] **Step 5: Assign the backend service account roles (one-time manual step from Task 2, Step 2)**

Open `http://localhost/auth/admin` in a browser, log in with `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` from `.env`, and assign `manage-users` + `view-users` (from the `realm-management` client) to the `usermgmt-backend` service account as described in Task 2 Step 2.

- [ ] **Step 6: Verify the custom theme renders**

Open `http://localhost/auth/realms/usermgmt/account` in a browser. Expected: the login page shows the blue `#3b82f6` primary button and the "M" monogram logo instead of the default Keycloak branding.

- [ ] **Step 7: Update `README.md`**

Remove any documented `JWT_KEY`/`JWT_ISSUER`/`JWT_AUDIENCE` env vars and the old register/login curl examples if present; add a short "Authentication" section pointing at Keycloak (`http://localhost/auth`, admin console credentials from `.env`, and the one-time service-account role assignment from Step 5).

- [ ] **Step 8: Commit**

```bash
git add gateway/nginx.conf docker-compose.yml README.md
git commit -m "infra: route /auth/ through the gateway to Keycloak"
```

---

### Task 5: Backend — replace the custom JWT auth with Keycloak token validation

**Files:**
- Modify: `backend/Program.cs`
- Modify: `backend/appsettings.json`
- Modify: `backend/DTOs/Dtos.cs`
- Delete: `backend/Controllers/AuthController.cs`
- Delete: `backend/Services/TokenService.cs`

**Interfaces:**
- Consumes: `Keycloak:PublicAuthority`, `Keycloak:InternalMetadataAddress`, `Keycloak:Audience` config keys (from `docker-compose.yml`, Task 1).
- Produces: `[Authorize]`/`[Authorize(Roles = "Admin,SuperAdmin")]` on controllers keep working unchanged, now validated against Keycloak-issued tokens with a `role` claim.

- [ ] **Step 1: Trim `backend/DTOs/Dtos.cs`**

Remove the `RegisterDto`, `LoginDto`, `AuthResponseDto`, `RefreshTokenDto`, and `ChangePasswordDto` records (the `// ── Auth ──` section header and its four records, plus `ChangePasswordDto` further down). Leave `UserDto`, `CreateUserDto`, `UpdateUserDto`, `UpdateProfileDto`, `SetRoleDto`, `PagedResult<T>`, and the `Mémoire` DTOs untouched.

- [ ] **Step 2: Delete `backend/Controllers/AuthController.cs` and `backend/Services/TokenService.cs`**

```bash
git rm backend/Controllers/AuthController.cs backend/Services/TokenService.cs
```

- [ ] **Step 3: Replace the `Keycloak`-relevant section of `backend/appsettings.json`**

Remove the `"Jwt"` section and add:

```json
  "Keycloak": {
    "PublicAuthority": "http://localhost/auth/realms/usermgmt",
    "InternalMetadataAddress": "http://keycloak:8080/auth/realms/usermgmt/.well-known/openid-configuration",
    "Audience": "usermgmt-backend",
    "Realm": "usermgmt",
    "AdminBaseUrl": "http://keycloak:8080/auth/",
    "AdminClientId": "usermgmt-backend",
    "AdminClientSecret": "usermgmt-backend-secret"
  },
```

(These are dev fallback values; `docker-compose.yml`'s `Keycloak__*` env vars from Task 1 override them at container runtime via ASP.NET Core's double-underscore configuration binding — same pattern already used for `ConnectionStrings__Default`.)

- [ ] **Step 4: Replace the JWT bearer configuration in `backend/Program.cs`**

Replace the whole block from `// ── JWT Authentication ───` through `builder.Services.AddAuthorization();` with:

```csharp
    // ── Keycloak JWT Authentication ──────────────────────────────────────────
    var kc = builder.Configuration.GetSection("Keycloak");
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opt =>
        {
            opt.MetadataAddress = kc["InternalMetadataAddress"]!;
            opt.RequireHttpsMetadata = false;
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = kc["PublicAuthority"],
                ValidateAudience = true,
                ValidAudience = kc["Audience"],
                ValidateLifetime = true,
                NameClaimType = "preferred_username",
                RoleClaimType = "role"
            };
        });

    builder.Services.AddAuthorization();
```

- [ ] **Step 5: Remove the `TokenService` registration and the SuperAdmin seed block**

Remove this line:

```csharp
    builder.Services.AddScoped<ITokenService, TokenService>();
```

Remove the whole seed block inside the startup `using (var scope = ...)`:

```csharp
        // ── Seed SuperAdmin (une seule fois) ──────────────────────────────
        if (!db.Users.Any(u => u.Role == "SuperAdmin"))
        {
            ...
        }
```

Keep `db.Database.Migrate();` — it still runs the EF migrations for the `Users`/`Memoires` tables.

- [ ] **Step 6: Verify the project still builds**

Run: `dotnet build backend/Api.csproj`
Expected: build succeeds (it will still reference `AppDbContext`, `Memoire`, `StorageService` etc. unchanged; `UsersController` will fail to compile at this point because it still calls things removed later in Task 9 — that's expected and fixed by Task 9, not this task, so builds may show `UsersController`/`Program.cs` errors related to `IUserProfileService`/`IKeycloakAdminService` not existing yet. Confirm no errors *other than* references to those two not-yet-created types).

- [ ] **Step 7: Commit**

```bash
git add backend/DTOs/Dtos.cs backend/appsettings.json backend/Program.cs
git rm backend/Controllers/AuthController.cs backend/Services/TokenService.cs
git commit -m "feat(backend): validate Keycloak JWTs instead of the custom auth system"
```

---

### Task 6: Backend — turn `User` into a profile-only entity and migrate the schema

**Files:**
- Modify: `backend/Models/User.cs`
- Modify: `backend/Infrastructure/AppDbContext.cs`
- Create: `backend/Migrations/<timestamp>_RemoveAuthFieldsFromUser.cs` (generated, not hand-written)

**Interfaces:**
- Produces: `User.Id` is now expected to equal the Keycloak `sub` claim (set explicitly by callers, no longer defaulted via `Guid.NewGuid()`).

- [ ] **Step 1: Rewrite `backend/Models/User.cs`**

```csharp
namespace Api.Models;

public class User
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public string? AvatarUrl { get; set; }
    public string? Phone { get; set; }
    public string? Department { get; set; }
}
```

- [ ] **Step 2: Update `backend/Infrastructure/AppDbContext.cs`**

Remove this line from the `User` entity configuration:

```csharp
            e.Property(u => u.Role).HasMaxLength(50).HasDefaultValue("User");
```

- [ ] **Step 3: Generate the EF Core migration**

Run (from `backend/`): `dotnet ef migrations add RemoveAuthFieldsFromUser`
Expected: a new file `backend/Migrations/<timestamp>_RemoveAuthFieldsFromUser.cs` is created, dropping the `PasswordHash`, `Role`, `RefreshToken`, `RefreshTokenExpiry` columns from `Users`, plus an updated `AppDbContextModelSnapshot.cs`.

If `dotnet ef` is not installed: `dotnet tool install --global dotnet-ef --version 8.*` first.

- [ ] **Step 4: Verify the migration was generated correctly**

Open the generated migration file and confirm the `Up()` method contains four `migrationBuilder.DropColumn(...)` calls (one each for `PasswordHash`, `Role`, `RefreshToken`, `RefreshTokenExpiry`) on table `"Users"`, and no unrelated changes.

- [ ] **Step 5: Commit**

```bash
git add backend/Models/User.cs backend/Infrastructure/AppDbContext.cs backend/Migrations
git commit -m "feat(backend): drop auth columns from Users, keep it as a profile table"
```

(The migration is applied automatically by `db.Database.Migrate()` in `Program.cs` the next time the `api` container starts — no manual `dotnet ef database update` needed, matching how `AddMemoires` was rolled out.)

---

### Task 7: Backend — auto-provision a local profile on first authenticated request

**Files:**
- Create: `backend/Services/UserProfileService.cs`
- Create: `backend/Middleware/UserProfileProvisioningMiddleware.cs`
- Modify: `backend/Program.cs`

**Interfaces:**
- Produces: `IUserProfileService.EnsureProfileAsync(ClaimsPrincipal, CancellationToken)` — upserts a `Users` row from token claims if none exists for that `sub`. Consumed by the middleware; also safe to call directly from controllers if needed later.

- [ ] **Step 1: Write `backend/Services/UserProfileService.cs`**

```csharp
using System.Security.Claims;
using Api.Infrastructure;
using Api.Models;

namespace Api.Services;

public interface IUserProfileService
{
    Task EnsureProfileAsync(ClaimsPrincipal principal, CancellationToken ct = default);
}

public class UserProfileService(AppDbContext db) : IUserProfileService
{
    public async Task EnsureProfileAsync(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
        if (sub is null || !Guid.TryParse(sub, out var id)) return;

        var existing = await db.Users.FindAsync(new object[] { id }, ct);
        if (existing is not null) return;

        db.Users.Add(new User
        {
            Id = id,
            Email = principal.FindFirstValue(ClaimTypes.Email) ?? principal.FindFirstValue("email") ?? string.Empty,
            FirstName = principal.FindFirstValue(ClaimTypes.GivenName) ?? principal.FindFirstValue("given_name") ?? string.Empty,
            LastName = principal.FindFirstValue(ClaimTypes.Surname) ?? principal.FindFirstValue("family_name") ?? string.Empty
        });
        await db.SaveChangesAsync(ct);
    }
}
```

Note: with `NameClaimType = "preferred_username"` set in Task 5, `ClaimTypes.NameIdentifier` is still populated separately by the JWT handler's default inbound claim mapping from the token's `sub` claim, so `FindFirstValue(ClaimTypes.NameIdentifier)` continues to work exactly as it did with the old custom JWTs (`UsersController.GetMe` already relies on this same claim today).

- [ ] **Step 2: Write `backend/Middleware/UserProfileProvisioningMiddleware.cs`**

```csharp
using Api.Services;

namespace Api.Middleware;

public class UserProfileProvisioningMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IUserProfileService profileService)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            await profileService.EnsureProfileAsync(context.User, context.RequestAborted);
        }

        await next(context);
    }
}
```

- [ ] **Step 3: Wire it into `backend/Program.cs`**

Add `using Api.Middleware;` to the top of the file.

Register the service, next to where `ITokenService` used to be registered:

```csharp
    builder.Services.AddScoped<IUserProfileService, UserProfileService>();
```

Add the middleware right after `app.UseAuthorization();`:

```csharp
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseMiddleware<UserProfileProvisioningMiddleware>();
```

- [ ] **Step 4: Commit**

```bash
git add backend/Services/UserProfileService.cs backend/Middleware/UserProfileProvisioningMiddleware.cs backend/Program.cs
git commit -m "feat(backend): auto-provision a local Users profile on first authenticated request"
```

(End-to-end verification — a real token producing a real row — happens in Task 14 once the frontend can actually log in.)

---

### Task 8: Backend — Keycloak Admin REST API client

**Files:**
- Create: `backend/Services/KeycloakAdminService.cs`
- Modify: `backend/Program.cs`

**Interfaces:**
- Produces:
  ```csharp
  public interface IKeycloakAdminService
  {
      Task<Guid> CreateUserAsync(string email, string firstName, string lastName, string password, string role, CancellationToken ct = default);
      Task SetRoleAsync(Guid userId, string role, CancellationToken ct = default);
      Task SetEnabledAsync(Guid userId, bool enabled, CancellationToken ct = default);
      Task DeleteUserAsync(Guid userId, CancellationToken ct = default);
      Task<(string Role, bool Enabled)> GetUserStatusAsync(Guid userId, CancellationToken ct = default);
  }
  ```
  Consumed by `UsersController` in Task 9.

- [ ] **Step 1: Write `backend/Services/KeycloakAdminService.cs`**

```csharp
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Api.Services;

public interface IKeycloakAdminService
{
    Task<Guid> CreateUserAsync(string email, string firstName, string lastName, string password, string role, CancellationToken ct = default);
    Task SetRoleAsync(Guid userId, string role, CancellationToken ct = default);
    Task SetEnabledAsync(Guid userId, bool enabled, CancellationToken ct = default);
    Task DeleteUserAsync(Guid userId, CancellationToken ct = default);
    Task<(string Role, bool Enabled)> GetUserStatusAsync(Guid userId, CancellationToken ct = default);
}

public class KeycloakAdminService(HttpClient http, IConfiguration config) : IKeycloakAdminService
{
    private static readonly string[] AppRoles = ["User", "Admin", "SuperAdmin"];

    private readonly string _realm = config["Keycloak:Realm"] ?? "usermgmt";
    private readonly string _clientId = config["Keycloak:AdminClientId"] ?? "usermgmt-backend";
    private readonly string _clientSecret = config["Keycloak:AdminClientSecret"] ?? "";

    private string? _cachedToken;
    private DateTimeOffset _tokenExpiry = DateTimeOffset.MinValue;

    public async Task<Guid> CreateUserAsync(string email, string firstName, string lastName, string password, string role, CancellationToken ct = default)
    {
        await AuthorizeAsync(ct);

        var response = await http.PostAsJsonAsync($"admin/realms/{_realm}/users", new
        {
            username = email,
            email,
            firstName,
            lastName,
            enabled = true,
            emailVerified = true,
            credentials = new[] { new { type = "password", value = password, temporary = true } }
        }, ct);
        response.EnsureSuccessStatusCode();

        var location = response.Headers.Location
            ?? throw new InvalidOperationException("Keycloak n'a pas renvoyé l'URL du nouvel utilisateur");
        var userId = Guid.Parse(location.Segments[^1]);

        await SetRoleAsync(userId, role, ct);
        return userId;
    }

    public async Task SetRoleAsync(Guid userId, string role, CancellationToken ct = default)
    {
        await AuthorizeAsync(ct);

        var current = await http.GetFromJsonAsync<List<KeycloakRole>>(
            $"admin/realms/{_realm}/users/{userId}/role-mappings/realm", ct) ?? [];
        var toRemove = current.Where(r => AppRoles.Contains(r.Name)).ToList();
        if (toRemove.Count > 0)
        {
            var removeRequest = new HttpRequestMessage(HttpMethod.Delete,
                $"admin/realms/{_realm}/users/{userId}/role-mappings/realm")
            { Content = JsonContent.Create(toRemove) };
            (await http.SendAsync(removeRequest, ct)).EnsureSuccessStatusCode();
        }

        var targetRole = await http.GetFromJsonAsync<KeycloakRole>($"admin/realms/{_realm}/roles/{role}", ct)
            ?? throw new InvalidOperationException($"Rôle Keycloak introuvable : {role}");

        var addResponse = await http.PostAsJsonAsync(
            $"admin/realms/{_realm}/users/{userId}/role-mappings/realm", new[] { targetRole }, ct);
        addResponse.EnsureSuccessStatusCode();
    }

    public async Task SetEnabledAsync(Guid userId, bool enabled, CancellationToken ct = default)
    {
        await AuthorizeAsync(ct);
        var response = await http.PutAsJsonAsync($"admin/realms/{_realm}/users/{userId}", new { enabled }, ct);
        response.EnsureSuccessStatusCode();
    }

    public async Task DeleteUserAsync(Guid userId, CancellationToken ct = default)
    {
        await AuthorizeAsync(ct);
        var response = await http.DeleteAsync($"admin/realms/{_realm}/users/{userId}", ct);
        response.EnsureSuccessStatusCode();
    }

    public async Task<(string Role, bool Enabled)> GetUserStatusAsync(Guid userId, CancellationToken ct = default)
    {
        await AuthorizeAsync(ct);

        var user = await http.GetFromJsonAsync<KeycloakUser>($"admin/realms/{_realm}/users/{userId}", ct);
        var roles = await http.GetFromJsonAsync<List<KeycloakRole>>(
            $"admin/realms/{_realm}/users/{userId}/role-mappings/realm", ct) ?? [];

        var role = AppRoles.FirstOrDefault(r => roles.Any(kr => kr.Name == r)) ?? "User";
        return (role, user?.Enabled ?? false);
    }

    private async Task AuthorizeAsync(CancellationToken ct)
    {
        if (_cachedToken is not null && DateTimeOffset.UtcNow < _tokenExpiry)
        {
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _cachedToken);
            return;
        }

        var tokenResponse = await http.PostAsync(
            $"realms/{_realm}/protocol/openid-connect/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = _clientId,
                ["client_secret"] = _clientSecret
            }), ct);
        tokenResponse.EnsureSuccessStatusCode();

        var payload = await tokenResponse.Content.ReadFromJsonAsync<KeycloakTokenResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Réponse de token Keycloak invalide");

        _cachedToken = payload.AccessToken;
        _tokenExpiry = DateTimeOffset.UtcNow.AddSeconds(payload.ExpiresIn - 10);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _cachedToken);
    }

    private record KeycloakRole(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("name")] string Name);

    private record KeycloakUser([property: JsonPropertyName("enabled")] bool Enabled);

    private record KeycloakTokenResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn);
}
```

- [ ] **Step 2: Register the typed `HttpClient` in `backend/Program.cs`**

Add next to the `IUserProfileService` registration from Task 7:

```csharp
    builder.Services.AddHttpClient<IKeycloakAdminService, KeycloakAdminService>((sp, client) =>
    {
        var baseUrl = sp.GetRequiredService<IConfiguration>()["Keycloak:AdminBaseUrl"]!;
        client.BaseAddress = new Uri(baseUrl);
    });
```

- [ ] **Step 3: Verify the project builds**

Run: `dotnet build backend/Api.csproj`
Expected: build succeeds. `UsersController` will still fail to compile until Task 9 rewires it — confirm the only remaining errors are inside `UsersController.cs`.

- [ ] **Step 4: Commit**

```bash
git add backend/Services/KeycloakAdminService.cs backend/Program.cs
git commit -m "feat(backend): add a Keycloak Admin REST API client"
```

---

### Task 9: Backend — rewire `UsersController` to drive Keycloak for identity operations

**Files:**
- Modify: `backend/Controllers/UsersController.cs`

**Interfaces:**
- Consumes: `IKeycloakAdminService` (Task 8), `IUserProfileService` (unused directly here — profile creation on login is handled by the middleware, not this controller).

- [ ] **Step 1: Rewrite `backend/Controllers/UsersController.cs`**

```csharp
using System.Security.Claims;
using Api.DTOs;
using Api.Infrastructure;
using Api.Models;
using Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Prometheus;

namespace Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController(AppDbContext db, IKeycloakAdminService keycloak, ILogger<UsersController> log) : ControllerBase
{
    private static readonly Counter AdminUsersCreated = Metrics
        .CreateCounter("admin_users_created_total", "Nombre total d'utilisateurs créés par un admin");

    // ── Profil personnel ─────────────────────────────────────────────────
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> GetMe()
    {
        var id = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();
        var (role, enabled) = await keycloak.GetUserStatusAsync(id);
        return Ok(ToDto(user, role, enabled));
    }

    [HttpPut("me")]
    public async Task<ActionResult<UserDto>> UpdateMe(UpdateProfileDto dto)
    {
        var id = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.FirstName = dto.FirstName;
        user.LastName = dto.LastName;
        user.Phone = dto.Phone;
        user.Department = dto.Department;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var (role, enabled) = await keycloak.GetUserStatusAsync(id);
        return Ok(ToDto(user, role, enabled));
    }

    // ── Admin CRUD ────────────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<PagedResult<UserDto>>> GetAll(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10,
        [FromQuery] string search = "", [FromQuery] string role = "",
        [FromQuery] bool? isActive = null)
    {
        var query = db.Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(u => u.FirstName.Contains(search) ||
                u.LastName.Contains(search) || u.Email.Contains(search));

        var total = await query.CountAsync();
        var profiles = await query.OrderBy(u => u.LastName)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        var items = new List<UserDto>();
        foreach (var profile in profiles)
        {
            var (userRole, enabled) = await keycloak.GetUserStatusAsync(profile.Id);
            if (!string.IsNullOrWhiteSpace(role) && role != userRole) continue;
            if (isActive.HasValue && isActive.Value != enabled) continue;
            items.Add(ToDto(profile, userRole, enabled));
        }

        return Ok(new PagedResult<UserDto>(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<UserDto>> GetById(Guid id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();
        var (role, enabled) = await keycloak.GetUserStatusAsync(id);
        return Ok(ToDto(user, role, enabled));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<UserDto>> Create(CreateUserDto dto)
    {
        if (await db.Users.AnyAsync(u => u.Email == dto.Email))
            return Conflict(new { message = "Email déjà utilisé" });

        var email = dto.Email.ToLowerInvariant();
        var userId = await keycloak.CreateUserAsync(email, dto.FirstName, dto.LastName, dto.Password, dto.Role);

        var user = new User
        {
            Id = userId,
            FirstName = dto.FirstName,
            LastName = dto.LastName,
            Email = email,
            Phone = dto.Phone,
            Department = dto.Department
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        AdminUsersCreated.Inc();
        log.LogInformation("Utilisateur créé par un admin : {Email}", user.Email);

        return CreatedAtAction(nameof(GetById), new { id = user.Id }, ToDto(user, dto.Role, true));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<UserDto>> Update(Guid id, UpdateUserDto dto)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.FirstName = dto.FirstName;
        user.LastName = dto.LastName;
        user.Phone = dto.Phone;
        user.Department = dto.Department;
        user.AvatarUrl = dto.AvatarUrl;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var (role, enabled) = await keycloak.GetUserStatusAsync(id);
        return Ok(ToDto(user, role, enabled));
    }

    [HttpPatch("{id:guid}/role")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> SetRole(Guid id, SetRoleDto dto)
    {
        if (!await db.Users.AnyAsync(u => u.Id == id)) return NotFound();
        await keycloak.SetRoleAsync(id, dto.Role);
        return NoContent();
    }

    [HttpPatch("{id:guid}/toggle-active")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> ToggleActive(Guid id)
    {
        if (!await db.Users.AnyAsync(u => u.Id == id)) return NotFound();
        var (_, enabled) = await keycloak.GetUserStatusAsync(id);
        await keycloak.SetEnabledAsync(id, !enabled);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();
        await keycloak.DeleteUserAsync(id);
        db.Users.Remove(user);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("stats")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Stats()
    {
        var profiles = await db.Users.ToListAsync();
        var total = profiles.Count;
        var active = 0;
        var admins = 0;
        foreach (var p in profiles)
        {
            var (role, enabled) = await keycloak.GetUserStatusAsync(p.Id);
            if (enabled) active++;
            if (role == "Admin") admins++;
        }
        var today = profiles.Count(u => u.CreatedAt.Date == DateTime.UtcNow.Date);
        return Ok(new { total, active, inactive = total - active, admins, newToday = today });
    }

    private static UserDto ToDto(User u, string role, bool isActive) => new(
        u.Id, u.FirstName, u.LastName, u.Email, role, isActive, u.AvatarUrl, u.Phone, u.Department, u.CreatedAt);
}
```

Note the `ChangePassword` endpoint is gone entirely — password changes now happen through the Keycloak account console (wired up in Task 13).

- [ ] **Step 2: Verify the backend builds clean**

Run: `dotnet build backend/Api.csproj`
Expected: build succeeds with zero errors (this is the first point since Task 5 where the whole backend should compile cleanly again).

- [ ] **Step 3: Commit**

```bash
git add backend/Controllers/UsersController.cs
git commit -m "feat(backend): drive user identity/role/status through the Keycloak admin API"
```

---

### Task 10: Frontend — install and bootstrap `keycloak-angular`

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/environments/environment.ts`
- Modify: `frontend/src/environments/environment.prod.ts`
- Modify: `frontend/angular.json`
- Create: `frontend/src/assets/silent-check-sso.html`
- Modify: `frontend/src/app/app.config.ts`

**Interfaces:**
- Produces: `environment.keycloakUrl`, an injectable `Keycloak` instance (from `keycloak-js`, provided app-wide by `provideKeycloak`), and a global bearer-token interceptor for any request whose URL matches `/api`. Consumed by `AuthService` (Task 11).

- [ ] **Step 1: Add dependencies to `frontend/package.json`**

In `dependencies`:

```json
    "keycloak-angular": "^15.2.1",
    "keycloak-js": "^25.0.6",
```

- [ ] **Step 2: Install**

Run: `cd frontend && npm install`
Expected: `node_modules/keycloak-angular` and `node_modules/keycloak-js` exist, `npm install` exits 0.

- [ ] **Step 3: Add `keycloakUrl` to both environment files**

`frontend/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  keycloakUrl: 'http://localhost/auth'
};
```

`frontend/src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: '/api',
  keycloakUrl: '/auth'
};
```

(Both point at the gateway's `/auth` route from Task 4, not a separate Keycloak port — this keeps the token issuer identical regardless of whether Angular assets are served by `ng serve` on :4200 or by the `web` container behind the gateway on :80.)

- [ ] **Step 4: Register the `assets` folder in `frontend/angular.json`**

Replace `"assets": []` (appears under `architect.build.options`) with:

```json
            "assets": [
              {
                "glob": "**/*",
                "input": "src/assets",
                "output": "assets"
              }
            ],
```

- [ ] **Step 5: Create `frontend/src/assets/silent-check-sso.html`**

```html
<!DOCTYPE html>
<html>
  <body>
    <script>
      parent.postMessage(location.href, location.origin);
    </script>
  </body>
</html>
```

This is keycloak-js's standard silent SSO-check page — it lets Keycloak detect an existing session in a background iframe without a full-page redirect on every app load.

- [ ] **Step 6: Rewrite `frontend/src/app/app.config.ts`**

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideKeycloak,
  createInterceptorCondition,
  IncludeBearerTokenCondition,
  INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG,
  includeBearerTokenInterceptor,
  withAutoRefreshToken,
  AutoRefreshTokenService,
  UserActivityService
} from 'keycloak-angular';
import { routes } from './app.routes';
import { environment } from '../environments/environment';

const bearerCondition = createInterceptorCondition<IncludeBearerTokenCondition>({
  urlPattern: /\/api(\/|$)/,
  bearerPrefix: 'Bearer'
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([includeBearerTokenInterceptor])),
    { provide: INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG, useValue: [bearerCondition] },
    provideKeycloak({
      config: {
        url: environment.keycloakUrl,
        realm: 'usermgmt',
        clientId: 'usermgmt-frontend'
      },
      initOptions: {
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        silentCheckSsoRedirectUri: window.location.origin + '/assets/silent-check-sso.html'
      },
      features: [
        withAutoRefreshToken({ onInactivityTimeout: 'logout', sessionTimeout: 60000 })
      ]
    }),
    AutoRefreshTokenService,
    UserActivityService
  ]
};
```

- [ ] **Step 7: Verify the frontend still builds**

Run: `cd frontend && npx ng build`
Expected: build fails at this point because `auth.service.ts`, `auth.guard.ts`, and the deleted-but-not-yet-deleted `auth.interceptor.ts` still reference the old API — confirm the errors are confined to those files (fixed in Task 11/12), not to `app.config.ts` or `environment.ts` itself.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/environments frontend/angular.json frontend/src/assets/silent-check-sso.html frontend/src/app/app.config.ts
git commit -m "feat(frontend): bootstrap keycloak-angular (OIDC config, bearer interceptor, silent SSO check)"
```

---

### Task 11: Frontend — rewrite `AuthService`, replace the guard and the manual interceptor

**Files:**
- Modify: `frontend/src/app/core/services/auth.service.ts`
- Modify: `frontend/src/app/core/guards/auth.guard.ts`
- Delete: `frontend/src/app/core/interceptors/auth.interceptor.ts`
- Modify: `frontend/src/app/shared/components/shell/shell.component.ts`

**Interfaces:**
- Consumes: `Keycloak` (from `keycloak-js`, provided by Task 10), `KEYCLOAK_EVENT_SIGNAL`/`KeycloakEventType` (from `keycloak-angular`).
- Produces: `AuthService.isLoggedIn`, `.isAdmin`, `.isSuperAdmin`, `.currentUser` — same public shape as before, so `ShellComponent`, `ProfileComponent`, and the memoire components that already read them don't need further changes beyond this task.

- [ ] **Step 1: Rewrite `frontend/src/app/core/services/auth.service.ts`**

```typescript
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Keycloak from 'keycloak-js';
import { KEYCLOAK_EVENT_SIGNAL, KeycloakEventType } from 'keycloak-angular';
import { tap } from 'rxjs';
import { User } from '../../shared/models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private keycloak = inject(Keycloak);
  private http = inject(HttpClient);
  private keycloakSignal = inject(KEYCLOAK_EVENT_SIGNAL);

  private _authenticated = signal(!!this.keycloak.authenticated);
  private _roles = signal<string[]>(this.keycloak.realmAccess?.roles ?? []);
  private _currentUser = signal<User | null>(null);

  isLoggedIn = this._authenticated.asReadonly();
  currentUser = this._currentUser.asReadonly();
  isAdmin = computed(() => this._roles().some(r => ['Admin', 'SuperAdmin'].includes(r)));
  isSuperAdmin = computed(() => this._roles().includes('SuperAdmin'));

  private readonly API = `${environment.apiUrl}/users`;

  constructor() {
    effect(() => {
      const event = this.keycloakSignal();

      if (
        event.type === KeycloakEventType.AuthSuccess ||
        event.type === KeycloakEventType.AuthRefreshSuccess ||
        event.type === KeycloakEventType.Ready
      ) {
        this._authenticated.set(!!this.keycloak.authenticated);
        this._roles.set(this.keycloak.realmAccess?.roles ?? []);
        if (this._authenticated() && !this._currentUser()) {
          this.loadProfile().subscribe();
        }
      }

      if (event.type === KeycloakEventType.AuthLogout) {
        this._authenticated.set(false);
        this._roles.set([]);
        this._currentUser.set(null);
      }
    });
  }

  login() {
    return this.keycloak.login({ redirectUri: window.location.origin + '/dashboard' });
  }

  logout() {
    return this.keycloak.logout({ redirectUri: window.location.origin });
  }

  loadProfile() {
    return this.http.get<User>(`${this.API}/me`).pipe(tap(user => this._currentUser.set(user)));
  }

  updateLocalUser(user: User) {
    this._currentUser.set(user);
  }

  accountUrl(): string {
    return `${this.keycloak.authServerUrl}realms/${this.keycloak.realm}/account`;
  }
}
```

> **Implementation note:** `KEYCLOAK_EVENT_SIGNAL` and `KeycloakEventType` are the event-bus exports documented for `keycloak-angular` 15.x. If the installed version's type declarations (`node_modules/keycloak-angular/index.d.ts`) name these differently, adjust the import names only — the `effect()` structure and the rest of the service stay the same.

- [ ] **Step 2: Rewrite `frontend/src/app/core/guards/auth.guard.ts`**

```typescript
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthGuardData, createAuthGuard } from 'keycloak-angular';
import { AuthService } from '../services/auth.service';

const isAccessAllowed = async (
  route: ActivatedRouteSnapshot,
  _state: RouterStateSnapshot,
  authData: AuthGuardData
) => {
  const { authenticated, grantedRoles } = authData;
  const router = inject(Router);
  const auth = inject(AuthService);

  if (!authenticated) {
    auth.login();
    return false;
  }

  const requiredRoles = route.data['roles'] as string[] | undefined;
  if (requiredRoles?.length) {
    const roles = grantedRoles.realmRoles ?? [];
    return requiredRoles.some(r => roles.includes(r)) ? true : router.parseUrl('/dashboard');
  }

  return true;
};

export const authGuard = createAuthGuard<CanActivateFn>(isAccessAllowed);
```

- [ ] **Step 3: Delete `frontend/src/app/core/interceptors/auth.interceptor.ts`**

```bash
git rm frontend/src/app/core/interceptors/auth.interceptor.ts
```

(Its job — attaching the bearer token and handling refresh — is now done by `includeBearerTokenInterceptor` + `withAutoRefreshToken`, wired in Task 10.)

- [ ] **Step 4: Update `frontend/src/app/shared/components/shell/shell.component.ts`**

No structural change needed — it already reads `auth.currentUser()`, `auth.isSuperAdmin()`, `auth.isAdmin()`, and calls `auth.logout()`, all of which keep the same signatures. Just confirm (no edit) that `ShellComponent` itself does not need a manual profile-load call, since `AuthService`'s constructor `effect()` now loads the profile automatically the moment `authenticated` flips to `true` (Step 1).

- [ ] **Step 5: Verify the frontend still builds**

Run: `cd frontend && npx ng build`
Expected: build fails only on `app.routes.ts` / `features/auth/*` (fixed in Task 12) and `profile.component.ts` / `user.service.ts` (fixed in Task 13) — confirm no errors remain in `auth.service.ts` or `auth.guard.ts` themselves.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/services/auth.service.ts frontend/src/app/core/guards/auth.guard.ts
git rm frontend/src/app/core/interceptors/auth.interceptor.ts
git commit -m "feat(frontend): drive AuthService and route guards off the Keycloak session"
```

---

### Task 12: Frontend — remove the custom login/register screens and update routes

**Files:**
- Delete: `frontend/src/app/features/auth/` (whole directory: `auth.routes.ts`, `login/login.component.ts`, `register/register.component.ts`)
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `authGuard` from Task 11 (now the only guard — `guestGuard` and `adminGuard` are gone).

- [ ] **Step 1: Delete the auth feature folder**

```bash
git rm -r frontend/src/app/features/auth
```

- [ ] **Step 2: Rewrite `frontend/src/app/app.routes.ts`**

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/components/shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'users',
        canActivate: [authGuard],
        data: { roles: ['Admin', 'SuperAdmin'] },
        loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent)
      },
      {
        path: 'admin',
        canActivate: [authGuard],
        data: { roles: ['Admin', 'SuperAdmin'] },
        loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent)
      },
      {
        path: 'memoires',
        loadComponent: () => import('./features/memoires/memoires.component').then(m => m.MemoiresComponent)
      },
      {
        path: 'admin/memoires',
        canActivate: [authGuard],
        data: { roles: ['Admin', 'SuperAdmin'] },
        loadComponent: () => import('./features/memoires/admin-memoires.component').then(m => m.AdminMemoiresComponent)
      },
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];
```

Note the top-level `'auth'` route branch is gone entirely — there is no more in-app login/register page. Visiting a protected route while unauthenticated now triggers `authGuard`'s `auth.login()` call (Task 11), which redirects the browser straight to Keycloak.

- [ ] **Step 3: Verify the frontend still builds**

Run: `cd frontend && npx ng build`
Expected: build fails only in `profile.component.ts` / `user.service.ts` (Task 13) — confirm no remaining errors reference `features/auth` or `guestGuard`/`adminGuard`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.routes.ts
git rm -r frontend/src/app/features/auth
git commit -m "feat(frontend): remove the custom login/register screens, route auth through Keycloak"
```

---

### Task 13: Frontend — drop self-service password change, link to the Keycloak account console

**Files:**
- Modify: `frontend/src/app/core/services/user.service.ts`
- Modify: `frontend/src/app/features/profile/profile.component.ts`
- Modify: `frontend/src/app/shared/models/user.model.ts`

**Interfaces:**
- Consumes: `AuthService.accountUrl()` (Task 11).

- [ ] **Step 1: Remove `changePassword` from `frontend/src/app/core/services/user.service.ts`**

Delete this method:

```typescript
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put(`${this.API}/me/password`, { currentPassword, newPassword });
  }
```

- [ ] **Step 2: Remove the unused `AuthResponse` interface from `frontend/src/app/shared/models/user.model.ts`**

Delete:

```typescript
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
```

- [ ] **Step 3: Rewrite `frontend/src/app/features/profile/profile.component.ts`**

Replace the whole "Changement de mot de passe" `<div class="card">` block in the template (the one containing `pwdForm`) with:

```html
      <!-- Sécurité (géré par Keycloak) -->
      <div class="card">
        <h2>Sécurité</h2>
        <p class="subtitle" style="margin-bottom: 1rem;">
          Le mot de passe et les sessions actives se gèrent depuis votre compte Keycloak.
        </p>
        <a [href]="auth.accountUrl()" target="_blank" rel="noopener" class="btn btn-primary">
          Gérer mon compte
        </a>
      </div>
```

Remove `pwdForm`, `savingPwd`, `pwdSuccess`, `pwdError`, and the `savePassword()` method from the component class. Remove the now-unused `pwdForm` validators config. The class becomes:

```typescript
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);
  private userSvc = inject(UserService);
  private fb = inject(FormBuilder);

  savingInfo = signal(false);
  infoSuccess = signal(false);
  infoError = signal('');

  infoForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    phone: [''],
    department: ['']
  });

  ngOnInit() {
    const u = this.auth.currentUser();
    if (u) this.infoForm.patchValue(u as any);
  }

  saveInfo() {
    if (this.infoForm.invalid) { this.infoForm.markAllAsTouched(); return; }
    this.savingInfo.set(true);
    this.userSvc.updateMe(this.infoForm.value as any).subscribe({
      next: (user) => {
        this.auth.updateLocalUser(user);
        this.infoSuccess.set(true);
        this.savingInfo.set(false);
        setTimeout(() => this.infoSuccess.set(false), 3000);
      },
      error: (e) => { this.infoError.set(e.error?.message ?? 'Erreur'); this.savingInfo.set(false); }
    });
  }

  initials() {
    const u = this.auth.currentUser();
    return u ? `${u.firstName[0]}${u.lastName[0]}`.toUpperCase() : '?';
  }
}
```

- [ ] **Step 4: Verify the frontend builds clean**

Run: `cd frontend && npx ng build`
Expected: build succeeds with zero errors — this is the first point since Task 10 where the whole frontend compiles cleanly again.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/services/user.service.ts frontend/src/app/features/profile/profile.component.ts frontend/src/app/shared/models/user.model.ts
git commit -m "feat(frontend): move password/session management to the Keycloak account console"
```

---

### Task 14: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and start the full stack**

Run: `docker compose up -d --build`
Expected: all containers report healthy/running via `docker compose ps`; `docker compose logs api --tail 50` shows `db.Database.Migrate()` completing with no errors and the `RemoveAuthFieldsFromUser` migration applied.

- [ ] **Step 2: Confirm the old auth endpoints are gone**

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost/api/auth/login`
Expected: `404` (the route no longer exists — `AuthController` was deleted in Task 5).

- [ ] **Step 3: Log in through the browser**

Open `http://localhost/dashboard`. Expected: redirected to the Keycloak login page (themed per Task 3) rather than an Angular login form. Log in as `superadmin@usermgmt.local` / `SuperAdmin@123` — Keycloak should immediately prompt for a new password (the seeded credential is `temporary: true`). Set a new password, then confirm you land back on `/dashboard` inside the Angular app, sidebar showing the SuperAdmin's name and role badge.

- [ ] **Step 4: Confirm profile auto-provisioning**

Run: `docker compose exec postgres psql -U postgres -d usermgmt -c "select id, email, first_name, last_name from \"Users\";"`
Expected: one row for `superadmin@usermgmt.local`, created automatically by `UserProfileProvisioningMiddleware` (Task 7) on first authenticated call — no seed script inserted it.

- [ ] **Step 5: Exercise the admin CRUD flow**

In the Angular app, go to **Utilisateurs** (as SuperAdmin) and:
1. Create a new user with role `User`.
2. Change their role to `Admin`.
3. Toggle them inactive, then active again.
4. Delete them.

After each action, cross-check in the Keycloak admin console (`http://localhost/auth/admin`, realm `usermgmt` → Users) that the corresponding user/role/enabled state actually changed there — this confirms `KeycloakAdminService` (Task 8) is really driving Keycloak and not just the local `Users` table.

- [ ] **Step 6: Confirm role enforcement on the API**

Log in as a plain `User`-role account (create one via step 5, or self-register through the Keycloak registration screen since `registrationAllowed: true`), grab its access token from the browser's dev tools (Network tab, any `/api/` request's `Authorization` header), and run:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <token>" http://localhost/api/users
```

Expected: `403`.

- [ ] **Step 7: Confirm token validation survives an API restart without restarting Keycloak**

Run: `docker compose restart api`
Then, without logging in again in the browser, reload `http://localhost/dashboard`.
Expected: still logged in, `/api/users/me` still returns `200` — this confirms `MetadataAddress`/JWKS resolution (Task 5) works correctly on every fresh JWT-bearer handler instance, not just the one live when the token was issued.

- [ ] **Step 8: Final check — no leftover references to the old auth system**

Run: `grep -ril "TokenService\|AuthController\|JWT_KEY\|RefreshToken" backend frontend/src --include="*.cs" --include="*.ts" --include="*.json"`
Expected: no matches (aside from this plan/spec document, which is outside those directories).
