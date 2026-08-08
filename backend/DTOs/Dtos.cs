namespace Api.DTOs;

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
public record SetRoleDto(string Role);

// ── Pagination ────────────────────────────────────────────────────────────
public record PagedResult<T>(IEnumerable<T> Items, int TotalCount, int Page, int PageSize);

// ── Mémoire ───────────────────────────────────────────────────────────────
public record CreateMemoireDto(
    string Titre, string Auteur, int Annee, string Specialite,
    string? Description, string? Promoteur, IFormFile? File);

public record MemoireDto(
    Guid Id, string Titre, string Auteur, int Annee, string Specialite,
    string? Description, string? Promoteur, string Statut, string? NoteRejet,
    Guid UserId, string UserFullName, string? FileUrl, DateTime CreatedAt, DateTime? UpdatedAt);

public record ReviewMemoireDto(string? NoteRejet);
