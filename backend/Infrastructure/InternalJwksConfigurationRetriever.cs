using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Api.Infrastructure;

/// <summary>
/// Keycloak annonce toutes ses URLs avec le hostname public défini par KC_HOSTNAME
/// (http://localhost/auth). Depuis le réseau Docker, cette URL est injoignable :
/// « localhost » y désigne le conteneur de l'API, pas la gateway. Le jwks_uri du
/// document de découverte est donc inutilisable côté serveur, et sans les clés
/// aucune signature ne peut être vérifiée.
///
/// Ce retriever lit le document de découverte via l'URL interne, puis charge le
/// JWKS lui aussi en interne au lieu de suivre l'URL publique annoncée. L'issuer
/// du document reste inchangé : c'est bien la valeur publique qui figure dans les
/// tokens et qui doit être validée.
/// </summary>
public sealed class InternalJwksConfigurationRetriever : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    private readonly string _internalJwksUri;

    public InternalJwksConfigurationRetriever(string internalJwksUri)
        => _internalJwksUri = internalJwksUri;

    /// <summary>
    /// Déduit l'URL interne du JWKS depuis celle du document de découverte.
    /// Les deux chemins sont fixés par la spécification OIDC et par Keycloak,
    /// ce qui évite d'avoir une troisième URL à maintenir en configuration.
    /// </summary>
    public static string JwksUriFromMetadataAddress(string metadataAddress)
    {
        const string wellKnownSuffix = "/.well-known/openid-configuration";

        var realmUrl = metadataAddress.EndsWith(wellKnownSuffix, StringComparison.OrdinalIgnoreCase)
            ? metadataAddress[..^wellKnownSuffix.Length]
            : metadataAddress.TrimEnd('/');

        return $"{realmUrl}/protocol/openid-connect/certs";
    }

    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address, IDocumentRetriever retriever, CancellationToken cancel)
    {
        var document = await retriever.GetDocumentAsync(address, cancel);
        var configuration = OpenIdConnectConfiguration.Create(document);

        var jwksDocument = await retriever.GetDocumentAsync(_internalJwksUri, cancel);
        var keySet = new JsonWebKeySet(jwksDocument);

        configuration.JsonWebKeySet = keySet;
        foreach (var key in keySet.GetSigningKeys())
            configuration.SigningKeys.Add(key);

        return configuration;
    }
}
