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
