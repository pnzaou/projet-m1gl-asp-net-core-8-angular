using System.Net;
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

public class KeycloakAdminService(HttpClient http, IConfiguration config, ILogger<KeycloakAdminService> logger) : IKeycloakAdminService
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

        try
        {
            var userResponse = await http.GetAsync($"admin/realms/{_realm}/users/{userId}", ct);
            if (userResponse.StatusCode == HttpStatusCode.NotFound)
            {
                logger.LogWarning("Keycloak user {UserId} was not found; using default status", userId);
                return ("User", false);
            }
            userResponse.EnsureSuccessStatusCode();
            var user = await userResponse.Content.ReadFromJsonAsync<KeycloakUser>(cancellationToken: ct);

            var rolesResponse = await http.GetAsync($"admin/realms/{_realm}/users/{userId}/role-mappings/realm", ct);
            if (rolesResponse.StatusCode == HttpStatusCode.NotFound)
            {
                logger.LogWarning("No Keycloak role mappings were found for user {UserId}; using default role", userId);
                return ("User", user?.Enabled ?? false);
            }
            rolesResponse.EnsureSuccessStatusCode();
            var roles = await rolesResponse.Content.ReadFromJsonAsync<List<KeycloakRole>>(cancellationToken: ct) ?? [];

            var role = AppRoles.FirstOrDefault(r => roles.Any(kr => kr.Name == r)) ?? "User";
            return (role, user?.Enabled ?? false);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            logger.LogWarning(ex, "Keycloak user {UserId} could not be retrieved; using default status", userId);
            return ("User", false);
        }
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
