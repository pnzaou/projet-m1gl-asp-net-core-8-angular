using System.Security.Claims;
using Api.Infrastructure;
using Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Api.Services;

public interface IUserProfileService
{
    Task EnsureProfileAsync(ClaimsPrincipal principal, CancellationToken ct = default);
}

public class UserProfileService(AppDbContext db, ILogger<UserProfileService> logger) : IUserProfileService
{
    public async Task EnsureProfileAsync(ClaimsPrincipal principal, CancellationToken ct = default)
    {
        var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
        if (sub is null || !Guid.TryParse(sub, out var id)) return;

        var existing = await db.Users.FindAsync(new object[] { id }, ct);
        if (existing is not null) return;

        var user = new User
        {
            Id = id,
            Email = principal.FindFirstValue(ClaimTypes.Email) ?? principal.FindFirstValue("email") ?? string.Empty,
            FirstName = principal.FindFirstValue(ClaimTypes.GivenName) ?? principal.FindFirstValue("given_name") ?? string.Empty,
            LastName = principal.FindFirstValue(ClaimTypes.Surname) ?? principal.FindFirstValue("family_name") ?? string.Empty
        };
        db.Users.Add(user);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            // Profile provisioning is best-effort: a token missing required claims (e.g. no
            // email) or a unique-constraint conflict must not turn into a 500 for the whole
            // request. Swallow and let the request continue; downstream controllers will see
            // no profile row (e.g. GetMe 404s) — a reasonable degraded outcome. Detach the
            // failed entity so it doesn't linger as "Added" on this scoped DbContext and get
            // re-inserted by an unrelated SaveChangesAsync call later in the same request.
            db.Entry(user).State = EntityState.Detached;
            logger.LogWarning(ex, "Failed to auto-provision Users profile for sub {Sub}", id);
        }
    }
}
