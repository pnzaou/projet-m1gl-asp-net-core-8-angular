using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFileUrlToMemoire : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // IF NOT EXISTS plutôt que AddColumn : la colonne a circulé sous forme
            // de patch manuel (fix_memoires.sql) avant d'être une migration, donc
            // certaines bases de dev l'ont déjà. Sans cela, Database.Migrate()
            // échouerait au démarrage sur ces bases-là.
            migrationBuilder.Sql(
                """ALTER TABLE "Memoires" ADD COLUMN IF NOT EXISTS "FileUrl" text;""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """ALTER TABLE "Memoires" DROP COLUMN IF EXISTS "FileUrl";""");
        }
    }
}
