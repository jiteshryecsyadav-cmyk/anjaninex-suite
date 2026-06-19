using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;
using Namokara.Api.Common.Errors;
using Namokara.Api.Modules.Migration.Services;

namespace Namokara.Api.Modules.Migration.Controllers;

// =============================================================================
// Import & Migration — naye customer ka purana data (Tally/Busy/Marg/Excel) bulk
// import karne ke endpoints. Sab firm-scoped (JWT firm_id se) — RLS bhi enforce karta.
//
//   GET  api/migration/template/{type}  → .xlsx template file
//   POST api/migration/import/{type}    → multipart file upload → per-row report
//
// type ∈ { parties, items, ledgers, bills, opening }
// =============================================================================
[ApiController]
[Route("api/migration")]
[Authorize]
public class MigrationController : ControllerBase
{
    private readonly IMigrationService _svc;
    public MigrationController(IMigrationService svc) => _svc = svc;

    private Guid CurrentFirmId =>
        Guid.Parse(User.FindFirst("firm_id")?.Value
            ?? throw new InvalidOperationException("firm_id claim missing"));

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirst("user_id")?.Value!);

    private Guid CurrentBranchId
    {
        get
        {
            var branchId = Request.Headers["X-Branch-Id"].FirstOrDefault()
                        ?? User.FindFirst("default_branch_id")?.Value;
            return Guid.Parse(branchId ?? throw new InvalidOperationException("Branch not selected"));
        }
    }

    // -------------------------------------------------------------------------
    // Template download — firm user jo party/bill bana sakta hai wo template le sake.
    // -------------------------------------------------------------------------
    [HttpGet("template/{type}")]
    [HasPermission("trading.party.view.firm")]
    public IActionResult Template(string type)
    {
        try
        {
            var bytes = _svc.BuildTemplate(type);
            var fileName = $"{type}-import-template.xlsx";
            return File(bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fileName);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = FriendlyError.From(ex) });
        }
    }

    // -------------------------------------------------------------------------
    // Import — multipart file upload (.xlsx ya .csv). Per-row success/error report.
    // create permission ke saath gate kiya (bulk insert = create operation).
    // -------------------------------------------------------------------------
    [HttpPost("import/{type}")]
    [HasPermission("trading.party.create.firm")]
    [RequestSizeLimit(20_000_000)]   // 20 MB — bade migration files allow
    public async Task<IActionResult> Import(string type, IFormFile? file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "Koi file upload nahi hui. .xlsx ya .csv file chunein." });

        var ext = Path.GetExtension(file.FileName ?? "").ToLowerInvariant();
        if (ext != ".xlsx" && ext != ".csv")
            return BadRequest(new { error = "Sirf .xlsx ya .csv file allowed hai." });

        try
        {
            await using var stream = file.OpenReadStream();
            var result = await _svc.ImportAsync(
                type, stream, file.FileName, CurrentFirmId, CurrentBranchId, CurrentUserId);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = FriendlyError.From(ex) });
        }
    }
}
