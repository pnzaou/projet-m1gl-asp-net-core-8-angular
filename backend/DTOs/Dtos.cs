namespace Api.DTOs;

// ── Auth ──────────────────────────────────────────────────────────────────
public record RegisterDto(string FirstName, string LastName, string Email, string Password);
public record LoginDto(string Email, string Password);
public record AuthResponseDto(string AccessToken, string RefreshToken, UserDto User);
public record RefreshTokenDto(string RefreshToken);

// ── User ──────────────────────────────────────────────────────────────────
public record UserDto(
    Guid Id, string FirstName, string LastName, string Email,
    string Role, bool IsActive, string? AvatarUrl, string? Phone,
    string? Department, DateTime CreatedAt);

public record CreateUserDto(
    string FirstName, string LastName, string Email, string Password,
    string Role, string? Phone, string? Department);

public record UpdateUserDto(
    string FirstName, string LastName, string? Phone,
    string? Department, string? AvatarUrl);

public record UpdateProfileDto(string FirstName, string LastName, string? Phone, string? Department);
public record ChangePasswordDto(string CurrentPassword, string NewPassword);
public record SetRoleDto(string Role);

// ── Pagination ────────────────────────────────────────────────────────────
public record PagedResult<T>(IEnumerable<T> Items, int TotalCount, int Page, int PageSize);
