using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Namokara.Api.Infrastructure.Persistence;

namespace Namokara.Api.Modules.Platform.Hubs;

// =============================================================================
// PARTY CHAT LIVE — WhatsApp jaisa turant message (SignalR).
// - Firm side: JWT se connect hota hai → apni firm ke group me (saare threads ke updates).
// - Party side: OTP session token se connect → sirf apne thread ke group me.
// - Message/delete par server "newMessage" event bhejta hai → dono taraf UI turant reload.
// - WebSocket na chale (nginx) to SignalR khud SSE/long-polling par gir jata hai.
// =============================================================================
public class PartyChatHub : Hub
{
    private readonly AppDbContext _db;
    public PartyChatHub(AppDbContext db) { _db = db; }

    // Firm user — apni firm ke saare chat updates
    [Authorize]
    public async Task JoinFirm()
    {
        var firmId = Context.User?.FindFirst("firm_id")?.Value;
        if (!string.IsNullOrEmpty(firmId))
            await Groups.AddToGroupAsync(Context.ConnectionId, $"pc-firm:{firmId}");
    }

    // Party — session token verify karke apne thread ke updates
    public async Task JoinParty(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 200) return;
        var conn = (NpgsqlConnection)_db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT thread_id FROM platform.party_chat_sessions WHERE token = @t AND expires_at > now()", conn);
        cmd.Parameters.AddWithValue("t", token);
        var r = await cmd.ExecuteScalarAsync();
        if (r is Guid threadId)
            await Groups.AddToGroupAsync(Context.ConnectionId, $"pc-thread:{threadId}");
    }
}

// Controllers yahan se broadcast karte hain — thread ke party listeners + firm ke sab users
public static class PartyChatEvents
{
    public static async Task Notify(IHubContext<PartyChatHub> hub, Guid threadId, Guid firmId)
    {
        try
        {
            await hub.Clients.Group($"pc-thread:{threadId}").SendAsync("newMessage", threadId);
            await hub.Clients.Group($"pc-firm:{firmId}").SendAsync("newMessage", threadId);
        }
        catch { /* live push fail ho to chat rukni nahi chahiye — polling backup hai */ }
    }
}
