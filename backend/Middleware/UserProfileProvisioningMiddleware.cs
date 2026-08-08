using Api.Services;

namespace Api.Middleware;

public class UserProfileProvisioningMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IUserProfileService profileService)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            await profileService.EnsureProfileAsync(context.User, context.RequestAborted);
        }

        await next(context);
    }
}
