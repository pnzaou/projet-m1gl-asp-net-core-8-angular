namespace Api.Models;

public class Memoire
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Titre { get; set; } = string.Empty;
    public string Auteur { get; set; } = string.Empty;
    public int Annee { get; set; } = DateTime.UtcNow.Year;
    public string Specialite { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Promoteur { get; set; }
    // "Delivre" | "Valide" | "Rejete"
    public string Statut { get; set; } = "Delivre";
    public string? NoteRejet { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
