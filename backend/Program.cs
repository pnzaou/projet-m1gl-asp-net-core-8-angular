using System.Security.Claims;
using Api.Infrastructure;
using Api.Middleware;
using Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Serilog.Formatting.Compact;
using Prometheus;
using Elastic.Ingest.Elasticsearch;
using Elastic.Ingest.Elasticsearch.DataStreams;
using Elastic.Serilog.Sinks;

Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // ── Serilog ─────────────────────────────────────────────────────────────
    builder.Host.UseSerilog((ctx, services, lc) =>
    {
        lc.ReadFrom.Configuration(ctx.Configuration)
          .ReadFrom.Services(services)
          .Enrich.FromLogContext()
          .WriteTo.Console(new RenderedCompactJsonFormatter())
          .WriteTo.File("logs/app-.log",
              rollingInterval: RollingInterval.Day,
              retainedFileCountLimit: 30);

        // Sink Elasticsearch activé seulement si l'URI est configurée, pour que
        // l'API démarre sans Elasticsearch (dev local hors Docker, tests).
        var elasticUri = ctx.Configuration["Elasticsearch:Uri"];
        if (!string.IsNullOrWhiteSpace(elasticUri))
        {
            lc.WriteTo.Elasticsearch(
                [new Uri(elasticUri)],
                opts =>
                {
                    // Flux de données « logs-usermgmt-api », convention Elastic.
                    opts.DataStream = new DataStreamName("logs", "usermgmt", "api");
                    // Silent : pose les templates d'index si possible et n'échoue
                    // pas si Elasticsearch n'est pas encore prêt au démarrage.
                    opts.BootstrapMethod = BootstrapMethod.Silent;
                });
        }
    });

    // ── PostgreSQL + EF Core ─────────────────────────────────────────────────
    builder.Services.AddDbContext<AppDbContext>(opt =>
        opt.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

    // ── Keycloak JWT Authentication ──────────────────────────────────────────
    var kc = builder.Configuration.GetSection("Keycloak");
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opt =>
        {
            // Keycloak est joint en interne (réseau Docker) mais émet ses tokens
            // avec l'issuer public (KC_HOSTNAME). Ce décalage est traité ici —
            // par un retriever qui va chercher le JWKS en interne et par des
            // ValidIssuers explicites — et non en désactivant la validation.
            var internalMetadataAddress = kc["InternalMetadataAddress"]!;
            opt.RequireHttpsMetadata = false;
            opt.Authority = kc["PublicAuthority"];
            opt.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                internalMetadataAddress,
                new InternalJwksConfigurationRetriever(
                    InternalJwksConfigurationRetriever.JwksUriFromMetadataAddress(internalMetadataAddress)),
                new HttpDocumentRetriever { RequireHttps = false });
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = new[]
                {
                    kc["PublicAuthority"]!,
                    $"http://keycloak:8080/auth/realms/{kc["Realm"]}"
                },
                ValidateAudience = true,
                ValidAudience = kc["Audience"],
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                RequireSignedTokens = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                NameClaimType = "preferred_username",
                RoleClaimType = "roles"
            };
            opt.Events = new JwtBearerEvents
            {
                OnTokenValidated = context =>
                {
                    var principal = context.Principal;
                    if (principal is null) return Task.CompletedTask;

                    var identity = (ClaimsIdentity)principal.Identity!;
                    if (principal.HasClaim(c => c.Type == "realm_access"))
                    {
                        var realmAccess = principal.FindFirst("realm_access");
                        if (realmAccess is not null)
                        {
                            var roles = System.Text.Json.JsonDocument.Parse(realmAccess.Value).RootElement.GetProperty("roles").EnumerateArray().Select(r => r.GetString()).Where(r => !string.IsNullOrWhiteSpace(r)).ToList();
                            foreach (var role in roles)
                            {
                                identity.AddClaim(new Claim(ClaimTypes.Role, role));
                                identity.AddClaim(new Claim("roles", role));
                            }
                        }
                    }

                    if (!identity.HasClaim(c => c.Type == ClaimTypes.Role) && !identity.HasClaim(c => c.Type == "roles"))
                    {
                        identity.AddClaim(new Claim(ClaimTypes.Role, "User"));
                        identity.AddClaim(new Claim("roles", "User"));
                    }

                    return Task.CompletedTask;
                },
                OnAuthenticationFailed = context =>
                {
                    Log.Warning(context.Exception, "Échec de validation du JWT");
                    return Task.CompletedTask;
                }
            };
        });

    builder.Services.AddAuthorization();

    builder.Services.AddSingleton<IStorageService, StorageService>();
    builder.Services.AddScoped<IUserProfileService, UserProfileService>();
    builder.Services.AddHttpClient<IKeycloakAdminService, KeycloakAdminService>((sp, client) =>
    {
        var baseUrl = sp.GetRequiredService<IConfiguration>()["Keycloak:AdminBaseUrl"]!;
        client.BaseAddress = new Uri(baseUrl);
    });
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
    }

    // Activer le middleware pour exposer les métriques
        app.UseHttpMetrics();  // Capture les métriques HTTP
        app.UseMetricServer(); // Expose /metrics


    app.UseSerilogRequestLogging(opts =>
        opts.MessageTemplate = "HTTP {RequestMethod} {RequestPath} → {StatusCode} ({Elapsed:0.0}ms)");

    if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

    app.UseHttpsRedirection();
    app.UseCors("AllowAngular");
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseMiddleware<UserProfileProvisioningMiddleware>();
    app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
    app.MapControllers();
    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "Application terminée de façon inattendue"); }
finally { Log.CloseAndFlush(); }
