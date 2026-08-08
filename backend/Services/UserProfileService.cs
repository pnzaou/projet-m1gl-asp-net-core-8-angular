using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
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
        var sub = principal.FindFirstValue("sub")
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");

        if (sub is null) return;

        Guid id;
        if (!Guid.TryParse(sub, out id))
        {
            var hash = MD5.HashData(Encoding.UTF8.GetBytes(sub));
            var bytes = new byte[16];
            Array.Copy(hash, bytes, 16);
            id = new Guid(bytes);
        }

        var existing = await db.Users.FindAsync(new object[] { id }, ct);
        if (existing is not null) return;

        var user = new User
        {
            Id = id,
            Email = principal.FindFirstValue(ClaimTypes.Email) ?? principal.FindFirstValue("email") ?? principal.FindFirstValue("preferred_username") ?? string.Empty,
            FirstName = principal.FindFirstValue(ClaimTypes.GivenName) ?? principal.FindFirstValue("given_name") ?? principal.FindFirstValue("preferred_username") ?? string.Empty,
            LastName = principal.FindFirstValue(ClaimTypes.Surname) ?? principal.FindFirstValue("family_name") ?? string.Empty
        };

        db.Users.Add(user);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {

            db.Entry(user).State = EntityState.Detached;
            logger.LogWarning(ex, "Failed to auto-provision Users profile for sub {Sub}", id);
        }
    }
}
