using System.Text;
using Api.Infrastructure;
using Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
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
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opt =>
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
