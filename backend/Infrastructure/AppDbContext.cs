using Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Api.Infrastructure;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Memoire> Memoires => Set<Memoire>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).HasMaxLength(256).IsRequired();
            e.Property(u => u.FirstName).HasMaxLength(100).IsRequired();
            e.Property(u => u.LastName).HasMaxLength(100).IsRequired();
            e.Property(u => u.Role).HasMaxLength(50).HasDefaultValue("User");
        });

        mb.Entity<Memoire>(e =>
        {
            e.HasKey(m => m.Id);
            e.Property(m => m.Titre).HasMaxLength(300).IsRequired();
            e.Property(m => m.Auteur).HasMaxLength(200).IsRequired();
            e.Property(m => m.Specialite).HasMaxLength(200).IsRequired();
            e.Property(m => m.Promoteur).HasMaxLength(200);
            e.Property(m => m.Statut).HasMaxLength(50).HasDefaultValue("Delivre");
            e.HasOne(m => m.User)
             .WithMany()
             .HasForeignKey(m => m.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
