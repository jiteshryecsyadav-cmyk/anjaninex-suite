using System.Data;
using System.Text;
using Npgsql;

namespace Namokara.Api.Modules.Suppliers.Services;

// =============================================================================
// PARTY MENU — party apna khata KHUD dekhe (corporate IVR jaisa numbered menu)
//
//   Party likhe "hi/menu/namaste"  →  MAIN MENU
//     1 Khata   → 1.1 Bakaya · 1.2 Bill-by-bill Statement · 1.3 Payment history
//     2 Orders  → chal rahe + poore hue
//     3 Bazaar  → naya stock (ORDER code ke saath)
//   Navigation har jagah ek jaisa:  0 = peeche · 9 = main menu
//
// NIYAM: bot sirf menu-shabd par jaagta hai; baki har message par CHUP rehta hai
// (firm ki asli baat-cheet me dakhal nahi). Har chunav audit-log me jata hai.
// Data sirf USI party ka — har query party_id/firm_id se bandhi hui hai.
// =============================================================================
public class PartyMenuService
{
    private readonly Func<string, Task<NpgsqlCommand>> _cmd;
    public PartyMenuService(Func<string, Task<NpgsqlCommand>> cmdFactory) { _cmd = cmdFactory; }

    private const string Foot = "\n────────────────\n0 ⟵ Peeche · 9 ⌂ Menu";

    /// Kaam khatam hone wale message ke neeche lagne wali patti — party ko
    /// dobara "hi" likhna na pade, seedha number daba kar aage badh jaye.
    public const string Hint = "\n────────────────\nAur kuch? 1 💰 Khata · 2 📦 Orders · 3 🛍️ Bazaar · 9 ⌂ Menu";

    public static bool IsMenuTrigger(string text)
    {
        var t = text.Trim().ToLowerInvariant();
        return t is "hi" or "hii" or "hello" or "hey" or "menu" or "start" or "namaste"
                 or "namaskar" or "नमस्ते" or "हाय" or "मेनू";
    }

    public string MainMenu(string firmName, string partyName) =>
        $"🏢 {firmName.ToUpperInvariant()}\n👤 {partyName} ji\n────────────────\n" +
        "1  💰 Khata / Account\n" +
        "2  📦 Mere Orders\n" +
        "3  🛍️ Bazaar — naya stock\n" +
        "4  💬 Firm se baat karni hai\n" +
        "────────────────\nNumber bhejein (jaise 1)";

    public string KhataMenu() =>
        "💰 KHATA / ACCOUNT\n────────────────\n" +
        "1  Kul bakaya (summary)\n" +
        "2  Bill-by-bill statement\n" +
        "3  Payment history\n" + Foot;

    // ---------- 1.1 Bakaya summary ----------
    public async Task<string> BakayaAsync(Guid firmId, Guid partyId)
    {
        decimal total = 0, overdue = 0; int cnt = 0; int oldest = 0;
        await using (var c = await _cmd(@"
            SELECT COALESCE(SUM(b.total - b.paid_amount), 0),
                   COUNT(*),
                   COALESCE(MAX(CURRENT_DATE - b.bill_date), 0)
              FROM trading.bills b
             WHERE b.firm_id = @f AND b.deleted_at IS NULL
               AND (b.party_id = @p OR b.buyer_party_id = @p)
               AND (b.total - b.paid_amount) > 0.01"))
        {
            c.Parameters.Add(new NpgsqlParameter("f", firmId));
            c.Parameters.Add(new NpgsqlParameter("p", partyId));
            await using var r = await c.ExecuteReaderAsync();
            if (await r.ReadAsync()) { total = r.GetDecimal(0); cnt = r.GetInt32(1); oldest = r.GetInt32(2); }
        }
        // 30 din se purane bill = overdue (aam vyapaar ka niyam)
        await using (var c2 = await _cmd(@"
            SELECT COALESCE(SUM(b.total - b.paid_amount), 0)
              FROM trading.bills b
             WHERE b.firm_id = @f AND b.deleted_at IS NULL
               AND (b.party_id = @p OR b.buyer_party_id = @p)
               AND (b.total - b.paid_amount) > 0.01
               AND b.bill_date < CURRENT_DATE - 30"))
        {
            c2.Parameters.Add(new NpgsqlParameter("f", firmId));
            c2.Parameters.Add(new NpgsqlParameter("p", partyId));
            overdue = (decimal)(await c2.ExecuteScalarAsync() ?? 0m);
        }

        if (cnt == 0) return "💰 KUL BAKAYA\n────────────────\n✅ Koi bill baki nahi — khata saaf hai!" + Foot;
        var sb = new StringBuilder("💰 KUL BAKAYA\n────────────────\n");
        sb.Append($"Baki bill : {cnt}\n");
        sb.Append($"Kul rakam : ₹{total:N2}\n");
        if (overdue > 0.01m) sb.Append($"30+ din ka: ₹{overdue:N2} ⚠️\n");
        sb.Append($"Sabse purana bill: {oldest} din\n");
        sb.Append("\nBill-by-bill dekhne ke liye 2 bhejein.");
        return sb + Foot;
    }

    // ---------- 1.2 Bill-by-bill statement ----------
    public async Task<string> StatementAsync(Guid firmId, Guid partyId)
    {
        var sb = new StringBuilder("📄 BILL-BY-BILL STATEMENT\n────────────────\n");
        decimal totalPending = 0; int n = 0;
        await using (var c = await _cmd(@"
            SELECT COALESCE(NULLIF(b.supplier_bill_no,''), b.bill_no), b.bill_date,
                   b.total, b.paid_amount
              FROM trading.bills b
             WHERE b.firm_id = @f AND b.deleted_at IS NULL
               AND (b.party_id = @p OR b.buyer_party_id = @p)
               AND (b.total - b.paid_amount) > 0.01
             ORDER BY b.bill_date
             LIMIT 15"))
        {
            c.Parameters.Add(new NpgsqlParameter("f", firmId));
            c.Parameters.Add(new NpgsqlParameter("p", partyId));
            await using var r = await c.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var pend = r.GetDecimal(2) - r.GetDecimal(3);
                totalPending += pend; n++;
                sb.Append($"{r.GetString(0)} · {r.GetFieldValue<DateOnly>(1):dd/MM/yy}\n");
                sb.Append($"   Bill ₹{r.GetDecimal(2):N0} · Baki ₹{pend:N0}\n");
            }
        }
        if (n == 0) return "📄 STATEMENT\n────────────────\n✅ Koi bill baki nahi." + Foot;
        sb.Append($"────────────────\nKUL BAKI: ₹{totalPending:N2}");
        if (n == 15) sb.Append("\n(sabse purane 15 bill dikhaye hain)");
        return sb + Foot;
    }

    // ---------- 1.3 Payment history ----------
    public async Task<string> PaymentsAsync(Guid firmId, Guid partyId)
    {
        var sb = new StringBuilder("💵 PAYMENT HISTORY (aakhri 10)\n────────────────\n");
        int n = 0;
        await using (var c = await _cmd(@"
            SELECT p.payment_no, p.payment_date, p.amount, p.payment_mode
              FROM trading.payments p
             WHERE p.firm_id = @f AND p.party_id = @p AND p.deleted_at IS NULL
             ORDER BY p.payment_date DESC, p.created_at DESC
             LIMIT 10"))
        {
            c.Parameters.Add(new NpgsqlParameter("f", firmId));
            c.Parameters.Add(new NpgsqlParameter("p", partyId));
            await using var r = await c.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                n++;
                sb.Append($"{r.GetFieldValue<DateOnly>(1):dd/MM/yy} · ₹{r.GetDecimal(2):N0} · {r.GetString(3)}\n");
            }
        }
        return (n == 0 ? "💵 PAYMENT HISTORY\n────────────────\nAbhi koi payment record nahi." : sb.ToString()) + Foot;
    }

    // ---------- 2. Orders ----------
    public async Task<string> OrdersAsync(Guid firmId, Guid partyId, string phone10)
    {
        var sb = new StringBuilder("📦 MERE ORDERS\n────────────────\n");
        int n = 0;
        // Bazaar (chat) ke orders — buyer ya supplier dono taraf
        await using (var c = await _cmd(@"
            SELECT order_code, status, quantity, rate_unit, amount, created_at::date, trading_order_no
              FROM wa.orders
             WHERE firm_id = @f AND (right(regexp_replace(COALESCE(buyer_phone,''),'\D','','g'),10) = @ph
                                  OR right(regexp_replace(COALESCE(supplier_phone,''),'\D','','g'),10) = @ph)
             ORDER BY created_at DESC LIMIT 10"))
        {
            c.Parameters.Add(new NpgsqlParameter("f", firmId));
            c.Parameters.Add(new NpgsqlParameter("ph", phone10));
            await using var r = await c.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                n++;
                var st = r.GetString(1) switch
                {
                    "pending_supplier" => "🕐 supplier ke jawab ka intezar",
                    "pending_agency"   => "⏳ agency ki manzoori baki",
                    "approved"         => "✅ PAKKA" + (r.IsDBNull(6) ? "" : $" ({r.GetString(6)})"),
                    "rejected"         => "❌ cancel",
                    _                   => r.GetString(1)
                };
                sb.Append($"{r.GetString(0)} · {r.GetFieldValue<DateTime>(5):dd/MM/yy}\n");
                sb.Append($"   {r.GetDecimal(2):0.##} {r.GetString(3)} = ₹{r.GetDecimal(4):N0}\n   {st}\n");
            }
        }
        return (n == 0 ? "📦 MERE ORDERS\n────────────────\nAbhi koi order nahi." : sb.ToString()) + Foot;
    }

    // ---------- 3. Bazaar — naya stock ----------
    public async Task<string> StockAsync(Guid firmId)
    {
        var sb = new StringBuilder("🛍️ NAYA STOCK (aakhri 8)\n────────────────\n");
        int n = 0;
        await using (var c = await _cmd(@"
            SELECT track_code, rate, rate_unit, category_name, created_at::date
              FROM wa.incoming
             WHERE firm_id = @f AND status = 'processed' AND track_code IS NOT NULL
               AND created_at > now() - interval '30 days'
             ORDER BY created_at DESC LIMIT 8"))
        {
            c.Parameters.Add(new NpgsqlParameter("f", firmId));
            await using var r = await c.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                n++;
                sb.Append($"{n}. {(r.IsDBNull(3) ? "Fabric" : r.GetString(3))} · ₹{r.GetDecimal(1):0.##}/{r.GetString(2)}\n");
                sb.Append($"   ORDER {r.GetString(0)}\n");
            }
            if (n > 0) sb.Append("\nOrder karne ke liye upar wala code bhejein\n(ya photo ke neeche 🛒 button dabaein).");
        }
        return (n == 0 ? "🛍️ NAYA STOCK\n────────────────\nAbhi koi naya stock nahi." : sb.ToString()) + Foot;
    }

    public string TalkToFirm() =>
        "💬 FIRM SE BAAT\n────────────────\nApna sawal yahin likh dein — firm ka aadmi jawab dega.\n" +
        "(Menu dobara kholne ke liye 'menu' likhein.)";
}
