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
