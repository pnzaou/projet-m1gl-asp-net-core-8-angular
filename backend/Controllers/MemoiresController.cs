using System.Security.Claims;
using Api.DTOs;
using Api.Infrastructure;
using Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Prometheus;

namespace Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MemoiresController(AppDbContext db, ILogger<MemoiresController> log) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        //Les metriques Prometheus pour le suivi des mémoires
    private static readonly Counter MemoiresCreated = Metrics
        .CreateCounter("memoires_created_total", "Nombre total de mémoires créés");

    private static readonly Counter MemoiresValidated = Metrics
        .CreateCounter("memoires_validated_total", "Nombre total de mémoires validés");

    private static readonly Counter MemoiresRejected = Metrics
        .CreateCounter("memoires_rejected_total", "Nombre total de mémoires rejetés");

    private static readonly Counter MemoiresDeleted = Metrics
        .CreateCounter("memoires_deleted_total", "Nombre total de mémoires supprimés");

    private static readonly Counter MemoiresViewed = Metrics
        .CreateCounter("memoires_viewed_total", "Nombre total de consultations de mémoires");


    // ── Étudiant : soumettre un mémoire ──────────────────────────────────
    [HttpPost]
    public async Task<ActionResult<MemoireDto>> Create(CreateMemoireDto dto)
    {
        var memoire = new Memoire
        {
            Titre = dto.Titre,
            Auteur = dto.Auteur,
            Annee = dto.Annee,
            Specialite = dto.Specialite,
            Description = dto.Description,
            Promoteur = dto.Promoteur,
            Statut = "Delivre",
            UserId = CurrentUserId
        };
        db.Memoires.Add(memoire);
        await db.SaveChangesAsync();
        MemoiresCreated.Inc();
        await db.Entry(memoire).Reference(m => m.User).LoadAsync();
        log.LogInformation("Mémoire créé : {Id} par {UserId}", memoire.Id, CurrentUserId);
        return CreatedAtAction(nameof(GetById), new { id = memoire.Id }, ToDto(memoire));
    }

    // ── Étudiant : voir ses propres mémoires ─────────────────────────────
    [HttpGet("mine")]
    public async Task<ActionResult<IEnumerable<MemoireDto>>> GetMine()
    {
        var userId = CurrentUserId;
        var rows = await db.Memoires
            .Include(m => m.User)
            .Where(m => m.UserId == userId)
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();

            MemoiresViewed.Inc(rows.Count);

        return Ok(rows.Select(ToDto));
    }

    // ── Admin : voir tous les mémoires ───────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<ActionResult<PagedResult<MemoireDto>>> GetAll(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10,
        [FromQuery] string search = "", [FromQuery] string statut = "")
    {
        var query = db.Memoires.Include(m => m.User).AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(m =>
                m.Titre.Contains(search) || m.Auteur.Contains(search) ||
                m.Specialite.Contains(search));

        if (!string.IsNullOrWhiteSpace(statut))
            query = query.Where(m => m.Statut == statut);

        var total = await query.CountAsync();
        var rows = await query
            .OrderByDescending(m => m.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

            MemoiresViewed.Inc(rows.Count);

        return Ok(new PagedResult<MemoireDto>(rows.Select(ToDto).ToList(), total, page, pageSize));
    }

    // ── Détail ────────────────────────────────────────────────────────────
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<MemoireDto>> GetById(Guid id)
    {
        var m = await db.Memoires.Include(m => m.User).FirstOrDefaultAsync(m => m.Id == id);
        if (m is null) return NotFound();

        // Un simple user ne peut voir que les siens
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin") && m.UserId != CurrentUserId)
            return Forbid();

            MemoiresViewed.Inc(); 

        return Ok(ToDto(m));
    }

    // ── Admin : valider ───────────────────────────────────────────────────
    [HttpPatch("{id:guid}/valider")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Valider(Guid id)
    {
        var m = await db.Memoires.FindAsync(id);
        if (m is null) return NotFound();

        m.Statut = "Valide";
        m.NoteRejet = null;
        m.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        MemoiresValidated.Inc();
        log.LogInformation("Mémoire {Id} validé par {Admin}", id, CurrentUserId);
        return NoContent();
    }

    // ── Admin : rejeter avec note ─────────────────────────────────────────
    [HttpPatch("{id:guid}/rejeter")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> Rejeter(Guid id, ReviewMemoireDto dto)
    {
        var m = await db.Memoires.FindAsync(id);
        if (m is null) return NotFound();

        m.Statut = "Rejete";
        m.NoteRejet = dto.NoteRejet;
        m.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        MemoiresRejected.Inc();
        log.LogInformation("Mémoire {Id} rejeté par {Admin}", id, CurrentUserId);
        return NoContent();
    }

    // ── Supprimer (owner ou admin) ────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var m = await db.Memoires.FindAsync(id);
        if (m is null) return NotFound();

        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin") && m.UserId != CurrentUserId)
            return Forbid();

        db.Memoires.Remove(m);
        await db.SaveChangesAsync();
        MemoiresDeleted.Inc();
        return NoContent();
    }

    private static MemoireDto ToDto(Memoire m) => new(
        m.Id, m.Titre, m.Auteur, m.Annee, m.Specialite,
        m.Description, m.Promoteur, m.Statut, m.NoteRejet,
        m.UserId, $"{m.User.FirstName} {m.User.LastName}",
        m.CreatedAt, m.UpdatedAt);
}
