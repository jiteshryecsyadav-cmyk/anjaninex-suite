using System.Diagnostics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Common.Auth;

namespace Namokara.Api.Modules.Platform.Controllers;

// =============================================================================
// BACKUP (sadmin) — WhatsApp jaisi "Chat backup" setting screen ka backend.
// Status: backup script har run par /var/backups/anjaninex/status.json likhta hai.
// Run: www-data ko sudoers me SIRF is script ki ijazat hai (bina password):
//   /etc/sudoers.d/anjaninex-backup →
//   www-data ALL=(root) NOPASSWD: /usr/local/bin/backup-anjaninex.sh
// =============================================================================
[ApiController]
[Route("api/admin/backup")]
[Authorize]
[HasPermission("platform.firm.view.platform")]
public class AdminBackupController : ControllerBase
{
    private const string StatusPath = "/var/backups/anjaninex/status.json";
    private const string ScriptPath = "/usr/local/bin/backup-anjaninex.sh";

    // ---- Setting-screen ka data: last backup kab/kitna, Drive on/off ----
    [HttpGet("status")]
    public IActionResult Status()
    {
        try
        {
            if (System.IO.File.Exists(StatusPath))
                return Content(System.IO.File.ReadAllText(StatusPath), "application/json");
        }
        catch { }
        return Content("{}", "application/json");
    }

    // ---- "Back up" button — script abhi chalao (background me; 1-2 min lagte hain) ----
    [HttpPost("run")]
    public IActionResult Run()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "sudo",
                Arguments = $"-n {ScriptPath}",
                UseShellExecute = false,
                RedirectStandardOutput = false,
                RedirectStandardError = false
            };
            Process.Start(psi);
            return Ok(new { started = true });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = "Backup shuru nahi hua: " + ex.Message });
        }
    }
}
