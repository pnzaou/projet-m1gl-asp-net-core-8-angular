using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetCurrentUserId(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirstValue("sub")
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");

        if (string.IsNullOrWhiteSpace(sub))
            throw new InvalidOperationException("No subject claim found for authenticated user.");

        return Guid.TryParse(sub, out var id) ? id : CreateStableGuid(sub);
    }

    private static Guid CreateStableGuid(string input)
    {
        var hash = MD5.HashData(Encoding.UTF8.GetBytes(input));
        return new Guid(hash.Take(16).ToArray());
    }
}
