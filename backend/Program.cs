using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Api.Infrastructure;
using Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Prometheus;
using Serilog;
using Serilog.Formatting.Compact;

Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // ── Serilog ─────────────────────────────────────────────────────────────
    builder.Host.UseSerilog((ctx, services, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.Console(new RenderedCompactJsonFormatter())
        .WriteTo.File("logs/app-.log",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 30));

    // ── PostgreSQL + EF Core ─────────────────────────────────────────────────
    builder.Services.AddDbContext<AppDbContext>(opt =>
        opt.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

    // ── JWT Authentication ───────────────────────────────────────────────────
    var jwtSection = builder.Configuration.GetSection("Jwt");
    var keycloakSection = builder.Configuration.GetSection("Keycloak");

    builder.Services
        .AddAuthentication(options =>
        {
            options.DefaultScheme = "MixedJwt";
            options.DefaultAuthenticateScheme = "MixedJwt";
            options.DefaultChallengeScheme = "MixedJwt";
        })
        .AddPolicyScheme("MixedJwt", "Accept either local JWT or Keycloak JWT", options =>
        {
            options.ForwardDefaultSelector = context =>
            {
                var header = context.Request.Headers.Authorization.ToString();
                if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                    return JwtBearerDefaults.AuthenticationScheme;

                var token = header["Bearer ".Length..].Trim();
                if (string.IsNullOrWhiteSpace(token))
                    return JwtBearerDefaults.AuthenticationScheme;

                try
                {
                    var jwtToken = new JwtSecurityTokenHandler().ReadJwtToken(token);
                    var issuer = jwtToken.Issuer;
                    var audiences = jwtToken.Audiences;
                    var isKeycloakToken = issuer.Contains("/realms/", StringComparison.OrdinalIgnoreCase)
                        || issuer.Contains("keycloak", StringComparison.OrdinalIgnoreCase)
                        || audiences.Any(a => string.Equals(a, keycloakSection["Audience"], StringComparison.OrdinalIgnoreCase));

                    return isKeycloakToken ? "KeycloakBearer" : JwtBearerDefaults.AuthenticationScheme;
                }
                catch
                {
                    return JwtBearerDefaults.AuthenticationScheme;
                }
            };
        })
        .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, opt =>
        {
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtSection["Issuer"],
                ValidAudience = jwtSection["Audience"],
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(jwtSection["Key"]!)),
                ClockSkew = TimeSpan.FromSeconds(30)
            };
        })
        .AddJwtBearer("KeycloakBearer", opt =>
        {
            opt.Authority = keycloakSection["Authority"];
            opt.Audience = keycloakSection["Audience"];
            opt.RequireHttpsMetadata = keycloakSection.GetValue<bool>("RequireHttpsMetadata", true);
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                NameClaimType = "preferred_username",
                RoleClaimType = ClaimTypes.Role,
                ValidIssuer = keycloakSection["Authority"],
                ValidAudience = keycloakSection["Audience"],
                ClockSkew = TimeSpan.FromSeconds(30)
            };
            opt.Events = new JwtBearerEvents
            {
                OnTokenValidated = context =>
                {
                    MapKeycloakRoles(context);
                    return Task.CompletedTask;
                }
            };
        });

    builder.Services.AddAuthorization();
    builder.Services.AddScoped<ITokenService, TokenService>();
    builder.Services.AddControllers();

    // ── CORS pour Angular dev ────────────────────────────────────────────────
    builder.Services.AddCors(o => o.AddPolicy("AllowAngular", p =>
        p.WithOrigins("http://localhost:4200")
         .AllowAnyHeader()
         .AllowAnyMethod()));

    // ── Swagger avec Bearer ──────────────────────────────────────────────────
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo { Title = "UserMgmt API", Version = "v1" });
        c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization", Type = SecuritySchemeType.Http, Scheme = "bearer"
        });
        c.AddSecurityRequirement(new OpenApiSecurityRequirement {{
            new OpenApiSecurityScheme {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            }, Array.Empty<string>()
        }});
    });

    var app = builder.Build();

    // ── Auto-migration au démarrage ───────────────────────────────────────
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();

        // ── Seed SuperAdmin (une seule fois) ──────────────────────────────
        if (!db.Users.Any(u => u.Role == "SuperAdmin"))
        {
            db.Users.Add(new Api.Models.User
            {
                FirstName = "Super",
                LastName = "Admin",
                Email = "superadmin@usermgmt.local",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("SuperAdmin@123"),
                Role = "SuperAdmin",
                IsActive = true
            });
            db.SaveChanges();
            Log.Information("Compte SuperAdmin créé : superadmin@usermgmt.local");
        }
    }

    app.UseHttpMetrics();
    app.UseMetricServer();

    app.UseSerilogRequestLogging(opts =>
        opts.MessageTemplate = "HTTP {RequestMethod} {RequestPath} → {StatusCode} ({Elapsed:0.0}ms)");

    if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

    app.UseHttpsRedirection();
    app.UseCors("AllowAngular");
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "Application terminée de façon inattendue"); }
finally { Log.CloseAndFlush(); }

static void MapKeycloakRoles(TokenValidatedContext context)
{
    if (context.Principal?.Identity is not ClaimsIdentity identity)
        return;

    var roles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    if (identity.FindFirst("realm_access") is { Value: not null } realmAccessClaim)
    {
        using var realmJson = JsonDocument.Parse(realmAccessClaim.Value);
        if (realmJson.RootElement.TryGetProperty("roles", out var realmRoles))
        {
            foreach (var role in realmRoles.EnumerateArray())
            {
                var roleName = role.GetString();
                if (!string.IsNullOrWhiteSpace(roleName))
                    roles.Add(roleName);
            }
        }
    }

    if (identity.FindFirst("resource_access") is { Value: not null } resourceAccessClaim)
    {
        using var resourceJson = JsonDocument.Parse(resourceAccessClaim.Value);
        foreach (var client in resourceJson.RootElement.EnumerateObject())
        {
            if (!client.Value.TryGetProperty("roles", out var clientRoles))
                continue;

            foreach (var role in clientRoles.EnumerateArray())
            {
                var roleName = role.GetString();
                if (!string.IsNullOrWhiteSpace(roleName))
                    roles.Add(roleName);
            }
        }
    }

    foreach (var role in roles)
        identity.AddClaim(new Claim(ClaimTypes.Role, role));
}
