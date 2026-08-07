using System.Text;
using Api.Infrastructure;
using Api.Middleware;
using Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Serilog.Formatting.Compact;
using Prometheus;

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
