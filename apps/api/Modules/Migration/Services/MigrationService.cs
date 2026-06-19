using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Namokara.Api.Common.Errors;
using Namokara.Api.Infrastructure.Persistence;
using Namokara.Api.Modules.Accounting.Entities;
using Namokara.Api.Modules.Trading.Services;

namespace Namokara.Api.Modules.Migration.Services;

// =============================================================================
// Import & Migration — naye customer (Tally/Busy/Marg/Excel se aaya) ka purana
// data bulk-import karke pehle din se ledger/khata sahi karne ke liye.
//
// 5 types: parties | items | ledgers | bills | opening
// Har type ka: Excel template download, .xlsx/.csv upload parse, per-row insert,
// per-row success/error report. Ek kharab row poore import ko fail nahi karti —
// har row alag try/catch me chalti hai aur friendly message collect hota hai.
// =============================================================================

public record ImportRowResult(int Row, bool Ok, string Message);
public record ImportResult(int Total, int Success, int Failed, List<ImportRowResult> Rows);

public interface IMigrationService
{
    // Template (.xlsx bytes) banaata hai — header bold + ek example row.
    byte[] BuildTemplate(string type);
    // Uploaded file (xlsx/csv) parse + import. fileName se extension decide hoti hai.
    Task<ImportResult> ImportAsync(string type, Stream fileStream, string fileName,
        Guid firmId, Guid branchId, Guid userId);
}

public class MigrationService : IMigrationService
{
    private readonly AppDbContext _db;
    private readonly IPartyService _partySvc;
    private readonly IItemService _itemSvc;
    private readonly IBillService _billSvc;
    private readonly ILogger<MigrationService> _log;

    public MigrationService(
        AppDbContext db,
        IPartyService partySvc,
        IItemService itemSvc,
        IBillService billSvc,
        ILogger<MigrationService> log)
    {
        _db = db;
        _partySvc = partySvc;
        _itemSvc = itemSvc;
        _billSvc = billSvc;
        _log = log;
    }

    // -------------------------------------------------------------------------
    // Column definitions per type (header + ek example value).
    // Pehla column * = mandatory (sirf UI hint ke liye; validation niche hoti hai).
    // -------------------------------------------------------------------------
    private static readonly Dictionary<string, (string[] Headers, string[] Example)> Templates = new()
    {
        ["parties"] = (
            new[] { "Name*", "Type (supplier/buyer/both)", "GSTIN", "PAN", "Phone", "Email", "Address", "City", "State", "Pincode" },
            new[] { "Shyam Textiles", "supplier", "08ABCDE1234F1Z5", "ABCDE1234F", "9876543210", "shyam@example.com", "12 Cloth Market", "Jaipur", "Rajasthan", "302001" }
        ),
        ["items"] = (
            new[] { "Name*", "HSN", "Unit", "DefaultRate" },
            new[] { "Cotton Saree 5.5m", "5407", "PCS", "850" }
        ),
        ["ledgers"] = (
            new[] { "LedgerName*", "Group", "OpeningBalance", "DrCr (Dr/Cr)" },
            new[] { "Office Rent", "Indirect Expenses", "0", "Dr" }
        ),
        ["bills"] = (
            new[] { "BillNo*", "BillDate* (dd-mm-yyyy)", "BillType (sale/purchase)", "SupplierName*", "BuyerName", "City", "TaxableValue*", "CGSTPct", "SGSTPct", "IGSTPct", "BillAmount", "Remark" },
            new[] { "INV-2025/001", "01-04-2025", "sale", "Shyam Textiles", "Ramesh Traders", "Jaipur", "10000", "2.5", "2.5", "0", "10500", "Opening bill" }
        ),
        ["opening"] = (
            new[] { "PartyName*", "AsOnDate (dd-mm-yyyy)", "Amount*", "DrCr (Dr/Cr)" },
            new[] { "Shyam Textiles", "01-04-2025", "25000", "Dr" }
        ),
    };

    private static void EnsureValidType(string type)
    {
        if (!Templates.ContainsKey(type))
            throw new ArgumentException($"Galat import type: '{type}'. Valid: parties, items, ledgers, bills, opening.");
    }

    // =========================================================================
    // TEMPLATE — ek sheet, bold header row, ek example row.
    // =========================================================================
    public byte[] BuildTemplate(string type)
    {
        EnsureValidType(type);
        var (headers, example) = Templates[type];

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(type);

        for (int c = 0; c < headers.Length; c++)
        {
            var head = ws.Cell(1, c + 1);
            head.Value = headers[c];
            head.Style.Font.Bold = true;
            head.Style.Fill.BackgroundColor = XLColor.FromHtml("#1B2E5C");
            head.Style.Font.FontColor = XLColor.White;

            // Example row (row 2) — sirf reference ke liye; user ise replace/delete kar sakta hai.
            ws.Cell(2, c + 1).Value = example.Length > c ? example[c] : "";
        }

        ws.Columns().AdjustToContents();
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // =========================================================================
    // IMPORT — parse rows then dispatch per type.
    // =========================================================================
    public async Task<ImportResult> ImportAsync(string type, Stream fileStream, string fileName,
        Guid firmId, Guid branchId, Guid userId)
    {
        EnsureValidType(type);

        // Stream ko memory me copy karo (ClosedXML/CSV dono seek karte hain).
        using var ms = new MemoryStream();
        await fileStream.CopyToAsync(ms);
        ms.Position = 0;

        var ext = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        List<Dictionary<string, string>> rows = ext == ".csv"
            ? ParseCsv(ms)
            : ParseXlsx(ms);

        if (rows.Count == 0)
            throw new ArgumentException("File me koi data row nahi mila. Template download karke usi format me data bharein.");

        return type switch
        {
            "parties" => await ImportPartiesAsync(rows, firmId, userId),
            "items"   => await ImportItemsAsync(rows, firmId),
            "ledgers" => await ImportLedgersAsync(rows, firmId),
            "bills"   => await ImportBillsAsync(rows, firmId, branchId, userId),
            "opening" => await ImportOpeningAsync(rows, firmId, branchId, userId),
            _         => throw new ArgumentException($"Galat type: {type}")
        };
    }

    // =========================================================================
    // PARSERS — header row column-name → cell value map per data row.
    // =========================================================================
    private static List<Dictionary<string, string>> ParseXlsx(Stream s)
    {
        var result = new List<Dictionary<string, string>>();
        using var wb = new XLWorkbook(s);
        var ws = wb.Worksheets.FirstOrDefault();
        if (ws == null) return result;

        var range = ws.RangeUsed();
        if (range == null) return result;

        var allRows = range.RowsUsed().ToList();
        if (allRows.Count < 2) return result;   // sirf header / khali

        // Header row = pehli row. Column names normalize (header label se).
        var headerCells = allRows[0].Cells().ToList();
        var headerNames = headerCells.Select(c => NormalizeHeader(c.GetString())).ToList();

        for (int r = 1; r < allRows.Count; r++)
        {
            var row = allRows[r];
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            bool anyValue = false;
            for (int c = 0; c < headerNames.Count; c++)
            {
                var key = headerNames[c];
                if (string.IsNullOrEmpty(key)) continue;
                // Column index 1-based in ClosedXML.
                var cell = row.Cell(c + 1);
                var val = cell.GetString()?.Trim() ?? "";
                if (!string.IsNullOrEmpty(val)) anyValue = true;
                dict[key] = val;
            }
            if (anyValue) result.Add(dict);   // poori khali row skip
        }
        return result;
    }

    /// <summary>
    /// Chhota robust CSV reader — quoted fields ("a,b"), escaped quotes (""),
    /// aur newlines-in-quotes handle karta hai. Koi extra package nahi.
    /// </summary>
    private static List<Dictionary<string, string>> ParseCsv(Stream s)
    {
        var result = new List<Dictionary<string, string>>();
        using var reader = new StreamReader(s, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var text = reader.ReadToEnd();
        var records = SplitCsvRecords(text);
        if (records.Count < 2) return result;

        var headerNames = records[0].Select(NormalizeHeader).ToList();
        for (int r = 1; r < records.Count; r++)
        {
            var fields = records[r];
            // Poori khali line skip
            if (fields.All(string.IsNullOrWhiteSpace)) continue;
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int c = 0; c < headerNames.Count; c++)
            {
                var key = headerNames[c];
                if (string.IsNullOrEmpty(key)) continue;
                dict[key] = c < fields.Count ? (fields[c] ?? "").Trim() : "";
            }
            result.Add(dict);
        }
        return result;
    }

    // CSV poore text ko records (list of fields) me todta hai — RFC-4180 style.
    private static List<List<string>> SplitCsvRecords(string text)
    {
        var records = new List<List<string>>();
        var field = new StringBuilder();
        var record = new List<string>();
        bool inQuotes = false;

        for (int i = 0; i < text.Length; i++)
        {
            char ch = text[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                    else inQuotes = false;
                }
                else field.Append(ch);
            }
            else
            {
                switch (ch)
                {
                    case '"': inQuotes = true; break;
                    case ',': record.Add(field.ToString()); field.Clear(); break;
                    case '\r': break;   // \r\n ya lone \r — ignore, \n handle karega
                    case '\n':
                        record.Add(field.ToString()); field.Clear();
                        records.Add(record); record = new List<string>();
                        break;
                    default: field.Append(ch); break;
                }
            }
        }
        // Aakhri field/record (file newline pe khatm na ho)
        if (field.Length > 0 || record.Count > 0)
        {
            record.Add(field.ToString());
            records.Add(record);
        }
        return records;
    }

    // Header label ("BillDate* (dd-mm-yyyy)") ko ek clean key me badlo: lowercased,
    // sirf letters/digits. "BillDate* (dd-mm-yyyy)" → "billdate".
    private static string NormalizeHeader(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";
        var sb = new StringBuilder();
        foreach (var ch in raw)
        {
            if (char.IsLetterOrDigit(ch)) sb.Append(char.ToLowerInvariant(ch));
            else if (ch == '*' || ch == '(') break;   // first marker/paren ke baad sab hint hai
        }
        return sb.ToString();
    }

    // -------------------------------------------------------------------------
    // Cell helpers
    // -------------------------------------------------------------------------
    private static string Get(Dictionary<string, string> row, params string[] keys)
    {
        foreach (var k in keys)
            if (row.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v))
                return v.Trim();
        return "";
    }

    private static decimal GetDecimal(Dictionary<string, string> row, params string[] keys)
    {
        var raw = Get(row, keys);
        if (string.IsNullOrEmpty(raw)) return 0m;
        // 1,250.50 jaise comma-grouped numbers bhi parse ho
        raw = raw.Replace(",", "").Replace("₹", "").Trim();
        return decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : 0m;
    }

    private static DateOnly ParseDate(string raw, string fieldName)
    {
        raw = (raw ?? "").Trim();
        if (string.IsNullOrEmpty(raw))
            throw new ArgumentException($"{fieldName} khali hai. Date dd-mm-yyyy format me daalein.");
        string[] formats = { "dd-MM-yyyy", "d-M-yyyy", "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yy", "dd.MM.yyyy" };
        if (DateOnly.TryParseExact(raw, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return d;
        // Excel kabhi date ko serial/locale me deta hai — last fallback
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
            return DateOnly.FromDateTime(dt);
        throw new ArgumentException($"{fieldName} ('{raw}') ka format galat hai. dd-mm-yyyy daalein (jaise 01-04-2025).");
    }

    private static string NormalizeDrCr(string raw)
    {
        return (raw ?? "").Trim().ToLowerInvariant() switch
        {
            "cr" or "credit" => "Cr",
            "dr" or "debit" => "Dr",
            _ => "Dr"
        };
    }

    // =========================================================================
    // 1) PARTIES — PartyService.Create reuse (contact + ledger + duplicate-check sab handle).
    // =========================================================================
    private async Task<ImportResult> ImportPartiesAsync(List<Dictionary<string, string>> rows, Guid firmId, Guid userId)
    {
        var results = new List<ImportRowResult>();
        int rowNo = 1;
        foreach (var row in rows)
        {
            rowNo++;   // header row = 1, pehli data row = 2
            try
            {
                var name = Get(row, "name");
                if (string.IsNullOrEmpty(name))
                    throw new ArgumentException("Name khali hai (mandatory).");

                var typeRaw = Get(row, "type").ToLowerInvariant();
                var partyType = typeRaw switch
                {
                    "supplier" or "seller" => "supplier",
                    "both" => "both",
                    _ => "buyer"
                };

                var dto = new CreatePartyDto(
                    DisplayName: name,
                    LegalName: null,
                    Phone: Get(row, "phone"),
                    Email: Get(row, "email"),
                    Gst: Get(row, "gstin", "gst"),
                    Pan: Get(row, "pan"),
                    Address: Get(row, "address"),
                    City: Get(row, "city"),
                    State: Get(row, "state"),
                    Pincode: Get(row, "pincode"),
                    PartyType: partyType,
                    CreditLimit: 0,
                    CreditDays: 30,
                    CommissionRate: 0,
                    OpeningBalance: 0,
                    OpeningType: "Dr");

                await _partySvc.Create(dto, firmId, userId);
                results.Add(new ImportRowResult(rowNo, true, $"Party '{name}' import ho gayi."));
            }
            catch (PartyExistsException ex)
            {
                results.Add(new ImportRowResult(rowNo, false, $"Party pehle se hai (GST: {ex.Gst ?? "-"}): {ex.DisplayName}"));
            }
            catch (Exception ex)
            {
                results.Add(new ImportRowResult(rowNo, false, FriendlyError.From(ex)));
            }
        }
        return Summarize(results);
    }

    // =========================================================================
    // 2) ITEMS — ItemService.Create reuse.
    // =========================================================================
    private async Task<ImportResult> ImportItemsAsync(List<Dictionary<string, string>> rows, Guid firmId)
    {
        var results = new List<ImportRowResult>();
        int rowNo = 1;
        foreach (var row in rows)
        {
            rowNo++;
            try
            {
                var name = Get(row, "name");
                if (string.IsNullOrEmpty(name))
                    throw new ArgumentException("Name khali hai (mandatory).");

                var unit = Get(row, "unit");
                var dto = new CreateItemDto(
                    Code: null,
                    Name: name,
                    HsnSac: Get(row, "hsn", "hsnsac"),
                    Unit: string.IsNullOrEmpty(unit) ? "PCS" : unit,
                    DefaultRate: GetDecimal(row, "defaultrate", "rate"),
                    TaxRate: 0,
                    Category: null);

                await _itemSvc.Create(dto, firmId);
                results.Add(new ImportRowResult(rowNo, true, $"Item '{name}' import ho gaya."));
            }
            catch (Exception ex)
            {
                results.Add(new ImportRowResult(rowNo, false, FriendlyError.From(ex)));
            }
        }
        return Summarize(results);
    }

    // =========================================================================
    // 3) ACCOUNT LEDGERS — group name → sub-group dhoondo, ledger banao with opening.
    //    (ChartOfAccounts ka structure reuse — sub_groups firm-scoped hain.)
    // =========================================================================
    private async Task<ImportResult> ImportLedgersAsync(List<Dictionary<string, string>> rows, Guid firmId)
    {
        var results = new List<ImportRowResult>();
        int rowNo = 1;
        foreach (var row in rows)
        {
            rowNo++;
            try
            {
                var name = Get(row, "ledgername", "name");
                if (string.IsNullOrEmpty(name))
                    throw new ArgumentException("LedgerName khali hai (mandatory).");

                var groupName = Get(row, "group");
                var subGroupId = await ResolveSubGroupIdAsync(firmId, groupName);

                // Same naam ka ledger pehle se ho to skip (idempotent re-import safe).
                var exists = await _db.Ledgers
                    .AnyAsync(l => l.FirmId == firmId && l.Name == name);
                if (exists)
                {
                    results.Add(new ImportRowResult(rowNo, false, $"Ledger '{name}' pehle se hai — skip kiya."));
                    continue;
                }

                var ledger = new Ledger
                {
                    Id = Guid.NewGuid(),
                    FirmId = firmId,
                    SubGroupId = subGroupId,
                    Name = name,
                    OpeningBalance = GetDecimal(row, "openingbalance"),
                    OpeningType = NormalizeDrCr(Get(row, "drcr", "drcrdrcr")),
                    IsActive = true,
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
                _db.Ledgers.Add(ledger);
                await _db.SaveChangesAsync();
                results.Add(new ImportRowResult(rowNo, true, $"Ledger '{name}' import ho gaya."));
            }
            catch (Exception ex)
            {
                results.Add(new ImportRowResult(rowNo, false, FriendlyError.From(ex)));
            }
        }
        return Summarize(results);
    }

    /// <summary>
    /// Group name se sub-group resolve karo. Pehle exact sub-group naam, phir group naam,
    /// phir "Indirect Expenses" default; warna firm ka koi bhi pehla sub-group.
    /// </summary>
    private async Task<Guid> ResolveSubGroupIdAsync(Guid firmId, string groupName)
    {
        groupName = (groupName ?? "").Trim();

        if (!string.IsNullOrEmpty(groupName))
        {
            // 1. Sub-group naam exact (case-insensitive)
            var sg = await _db.SubGroups
                .FirstOrDefaultAsync(s => s.FirmId == firmId && s.Name.ToLower() == groupName.ToLower());
            if (sg != null) return sg.Id;

            // 2. Parent group naam se — us group ka pehla sub-group
            var byGroup = await (from s in _db.SubGroups
                                 join g in _db.AccountGroups on s.GroupId equals g.Id
                                 where s.FirmId == firmId && g.Name.ToLower() == groupName.ToLower()
                                 select s).FirstOrDefaultAsync();
            if (byGroup != null) return byGroup.Id;
        }

        // 3. "Indirect Expenses" default (account ledger ke liye natural ghar)
        var fallback = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId &&
                (s.Name == "Indirect Expenses" || s.Name == "Indirect Income"));
        if (fallback != null) return fallback.Id;

        // 4. Koi bhi sub-group (warna ledger ban hi nahi sakta)
        var any = await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId);
        if (any != null) return any.Id;

        throw new InvalidOperationException(
            "Is firm me koi accounting sub-group nahi mila. Pehle Chart of Accounts initialize karein " +
            "(Accounting → Settings), phir ledgers import karein.");
    }

    // =========================================================================
    // 4) BILLS — supplier/buyer name se match, phir BillService.Create reuse
    //    (voucher auto-post + round-off + GST split sab BillService karta hai).
    // =========================================================================
    private async Task<ImportResult> ImportBillsAsync(
        List<Dictionary<string, string>> rows, Guid firmId, Guid branchId, Guid userId)
    {
        var results = new List<ImportRowResult>();
        int rowNo = 1;
        foreach (var row in rows)
        {
            rowNo++;
            try
            {
                var billNo = Get(row, "billno");
                if (string.IsNullOrEmpty(billNo))
                    throw new ArgumentException("BillNo khali hai (mandatory).");

                var billDate = ParseDate(Get(row, "billdate"), "BillDate");

                var typeRaw = Get(row, "billtype").ToLowerInvariant();
                var billType = typeRaw switch
                {
                    "purchase" or "purc" or "buy" => "purchase",
                    _ => "sales"   // "sale"/"sales"/blank → sales
                };

                var supplierName = Get(row, "suppliername");
                if (string.IsNullOrEmpty(supplierName))
                    throw new ArgumentException("SupplierName khali hai (mandatory).");

                var supplierId = await MatchPartyIdAsync(firmId, supplierName)
                    ?? throw new ArgumentException($"Supplier '{supplierName}' nahi mila. Pehle is party ko import/banayein.");

                Guid? buyerId = null;
                var buyerName = Get(row, "buyername");
                if (!string.IsNullOrEmpty(buyerName))
                {
                    buyerId = await MatchPartyIdAsync(firmId, buyerName)
                        ?? throw new ArgumentException($"Buyer '{buyerName}' nahi mila. Pehle is party ko import/banayein.");
                }

                var taxable = GetDecimal(row, "taxablevalue", "taxable");
                if (taxable <= 0)
                    throw new ArgumentException("TaxableValue 0 se zyada honi chahiye.");

                var cgstPct = GetDecimal(row, "cgstpct");
                var sgstPct = GetDecimal(row, "sgstpct");
                var igstPct = GetDecimal(row, "igstpct");
                var taxRate = cgstPct + sgstPct + igstPct;   // total GST% — line ka tax rate

                var taxAmt = Math.Round(taxable * taxRate / 100m, 2, MidpointRounding.AwayFromZero);
                var lineTotal = Math.Round(taxable + taxAmt, 2, MidpointRounding.AwayFromZero);

                // Ek hi line — pura taxable value as a single "Imported (Migration)" item.
                // BillService isi se voucher post karta hai (Dr supplier / Cr sales etc.).
                var line = new BillLineDto(
                    Id: null,
                    ItemId: null,
                    ItemName: "Imported (Migration)",
                    HsnSac: null,
                    Qty: 1,
                    Unit: "PCS",
                    Rate: taxable,
                    DiscountPct: 0,
                    TaxRate: taxRate,
                    TaxableAmount: taxable,
                    TotalAmount: lineTotal,
                    Description: Get(row, "remark"));

                // SupplierBillNo mandatory hai BillService me — imported bill no use karo.
                var dto = new CreateBillDto(
                    BillType: billType,
                    BillDate: billDate,
                    PartyId: supplierId,
                    BuyerPartyId: buyerId,
                    InvoiceType: null,
                    PoNumber: null,
                    SupplierBillNo: billNo,
                    DeliveryDate: null,
                    Discount: 0,
                    RoundOff: 0,
                    Notes: $"Imported via Migration. Original Bill No: {billNo}. {Get(row, "remark")}".Trim(),
                    EwayBillNo: null,
                    EwayBillDate: null,
                    TransporterId: null,
                    LrNo: null,
                    LrDate: null,
                    Lines: new List<BillLineDto> { line },
                    CdType: "before",
                    OrderId: null);

                var created = await _billSvc.Create(dto, firmId, branchId, userId);
                results.Add(new ImportRowResult(rowNo, true,
                    $"Bill '{billNo}' ({billType}) import + voucher post ho gaya → {created.BillNo}"));
            }
            catch (BillDuplicateException dup)
            {
                results.Add(new ImportRowResult(rowNo, false,
                    $"Bill pehle se hai (same supplier + bill no + date): {dup.ExistingBillNo}"));
            }
            catch (Exception ex)
            {
                results.Add(new ImportRowResult(rowNo, false, FriendlyError.From(ex)));
            }
        }
        return Summarize(results);
    }

    // =========================================================================
    // 5) OPENING BALANCES — per party ek balanced opening JOURNAL voucher:
    //      Dr (amount Dr) → Dr Party / Cr "Opening Balance" ledger
    //      Cr (amount Cr) → Cr Party / Dr "Opening Balance" ledger
    //    "Opening Balance" contra ledger firm me ek baar auto-create hota hai.
    //    Isse trial balance balanced rehta hai aur khata pehle din se sahi.
    // =========================================================================
    private async Task<ImportResult> ImportOpeningAsync(
        List<Dictionary<string, string>> rows, Guid firmId, Guid branchId, Guid userId)
    {
        var results = new List<ImportRowResult>();

        // Opening Balance contra ledger ek baar resolve/create
        Guid openingLedgerId;
        try
        {
            openingLedgerId = await FindOrCreateOpeningBalanceLedgerAsync(firmId);
        }
        catch (Exception ex)
        {
            // Saari rows fail — clear reason ke saath
            int rn = 1;
            foreach (var _ in rows)
            {
                rn++;
                results.Add(new ImportRowResult(rn, false, FriendlyError.From(ex)));
            }
            return Summarize(results);
        }

        int rowNo = 1;
        foreach (var row in rows)
        {
            rowNo++;
            try
            {
                var partyName = Get(row, "partyname", "name");
                if (string.IsNullOrEmpty(partyName))
                    throw new ArgumentException("PartyName khali hai (mandatory).");

                var amount = GetDecimal(row, "amount");
                amount = Math.Round(Math.Abs(amount), 2, MidpointRounding.AwayFromZero);
                if (amount <= 0)
                    throw new ArgumentException("Amount 0 se zyada honi chahiye.");

                var drCr = NormalizeDrCr(Get(row, "drcr"));
                var asOn = string.IsNullOrEmpty(Get(row, "asondate"))
                    ? GetFyStart()
                    : ParseDate(Get(row, "asondate"), "AsOnDate");

                // Party + uska ledger dhoondo (BillService jaisa auto-create yahan nahi —
                // party master pehle import hona chahiye).
                var partyLedgerId = await GetPartyLedgerIdAsync(firmId, partyName)
                    ?? throw new ArgumentException(
                        $"Party '{partyName}' (ya uska ledger) nahi mila. Pehle party import karein.");

                await PostOpeningVoucherAsync(firmId, branchId, userId,
                    partyLedgerId, openingLedgerId, amount, drCr, asOn, partyName);

                results.Add(new ImportRowResult(rowNo, true,
                    $"'{partyName}' ka opening {drCr} ₹{amount:N2} post ho gaya."));
            }
            catch (Exception ex)
            {
                results.Add(new ImportRowResult(rowNo, false, FriendlyError.From(ex)));
            }
        }
        return Summarize(results);
    }

    private async Task PostOpeningVoucherAsync(
        Guid firmId, Guid branchId, Guid userId,
        Guid partyLedgerId, Guid openingLedgerId,
        decimal amount, string drCr, DateOnly asOn, string partyName)
    {
        // Voucher number — VoucherService ka counter reuse karne ke liye yahan seedha
        // platform.voucher_counters se nikalte hain (RLS-safe TenantContextSetter ke saath).
        var voucherNo = await GenerateJournalVoucherNoAsync(firmId, branchId);

        var voucher = new Voucher
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            BranchId = branchId,
            VoucherType = "journal",
            VoucherNo = voucherNo,
            VoucherDate = asOn,
            Narration = $"Opening Balance — {partyName} (Imported via Migration)",
            TotalAmount = amount,
            SourceModule = "migration",
            IsPosted = true,
            CreatedBy = userId,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        // Dr party → Cr Opening Balance | Cr party → Dr Opening Balance
        // (har line 2-decimal round; dono lines same amount → hamesha balanced.)
        var amt = Math.Round(amount, 2, MidpointRounding.AwayFromZero);
        if (drCr == "Dr")
        {
            voucher.Lines.Add(NewLine(voucher.Id, partyLedgerId, "Dr", amt, "Opening (Dr)", 0));
            voucher.Lines.Add(NewLine(voucher.Id, openingLedgerId, "Cr", amt, "Opening Balance", 1));
        }
        else
        {
            voucher.Lines.Add(NewLine(voucher.Id, partyLedgerId, "Cr", amt, "Opening (Cr)", 0));
            voucher.Lines.Add(NewLine(voucher.Id, openingLedgerId, "Dr", amt, "Opening Balance", 1));
        }

        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
    }

    private static VoucherLine NewLine(Guid voucherId, Guid ledgerId, string drCr, decimal amt, string narr, int order)
        => new VoucherLine
        {
            Id = Guid.NewGuid(),
            VoucherId = voucherId,
            LedgerId = ledgerId,
            DebitCredit = drCr,
            Amount = amt,
            Narration = narr,
            SortOrder = order
        };

    /// <summary>
    /// "Opening Balance" naam ka ek contra ledger firm me ek baar dhoondo/banayein.
    /// "Capital Account" group ke pass rakhne ki koshish; warna kisi bhi sub-group ke
    /// under (taaki opening journal balanced post ho sake).
    /// </summary>
    private async Task<Guid> FindOrCreateOpeningBalanceLedgerAsync(Guid firmId)
    {
        var existing = await _db.Ledgers
            .Where(l => l.FirmId == firmId && l.Name == "Opening Balance")
            .Select(l => l.Id).FirstOrDefaultAsync();
        if (existing != Guid.Empty) return existing;

        // Capital / Reserves jaisa ghar dhoondo; warna koi bhi sub-group
        var subGroup = await _db.SubGroups
            .FirstOrDefaultAsync(s => s.FirmId == firmId &&
                (s.Name == "Capital Account" || s.Name == "Reserves & Surplus"
                 || s.Name.ToLower().Contains("capital")));
        subGroup ??= await _db.SubGroups.FirstOrDefaultAsync(s => s.FirmId == firmId);

        if (subGroup == null)
            throw new InvalidOperationException(
                "Is firm me koi accounting sub-group nahi mila. Pehle Chart of Accounts initialize karein " +
                "(Accounting → Settings), phir opening balances import karein.");

        var ledger = new Ledger
        {
            Id = Guid.NewGuid(),
            FirmId = firmId,
            SubGroupId = subGroup.Id,
            Name = "Opening Balance",
            OpeningBalance = 0,
            OpeningType = "Cr",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Ledgers.Add(ledger);
        await _db.SaveChangesAsync();
        _log.LogInformation("Created 'Opening Balance' contra ledger under sub-group '{Sg}'", subGroup.Name);
        return ledger.Id;
    }

    // -------------------------------------------------------------------------
    // Party name → party id (case-insensitive trimmed exact match on contact name).
    // -------------------------------------------------------------------------
    private async Task<Guid?> MatchPartyIdAsync(Guid firmId, string name)
    {
        name = (name ?? "").Trim();
        if (string.IsNullOrEmpty(name)) return null;
        var match = await (from p in _db.PartyProfiles
                           join c in _db.Contacts on p.ContactId equals c.Id
                           where p.FirmId == firmId && p.IsActive
                                 && c.DisplayName.ToLower() == name.ToLower()
                           select (Guid?)p.Id).FirstOrDefaultAsync();
        return match;
    }

    // Party name → uska accounting ledger id (opening voucher ke liye).
    private async Task<Guid?> GetPartyLedgerIdAsync(Guid firmId, string name)
    {
        name = (name ?? "").Trim();
        if (string.IsNullOrEmpty(name)) return null;
        var ledgerId = await (from p in _db.PartyProfiles
                              join c in _db.Contacts on p.ContactId equals c.Id
                              where p.FirmId == firmId && p.IsActive
                                    && c.DisplayName.ToLower() == name.ToLower()
                                    && p.LedgerId != null
                              select p.LedgerId).FirstOrDefaultAsync();
        return ledgerId;
    }

    // -------------------------------------------------------------------------
    // Journal voucher number — same race-safe counter jaise VoucherService/BillService.
    // -------------------------------------------------------------------------
    private async Task<string> GenerateJournalVoucherNoAsync(Guid firmId, Guid branchId)
    {
        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == branchId)
                  ?? await _db.Branches.FirstOrDefaultAsync(b => b.FirmId == firmId)
                  ?? throw new InvalidOperationException("Is firm ka koi branch nahi mila. Team → Branches me ek branch banayein.");
        var prefix = branch.VoucherPrefix ?? $"{branch.Code}-V-";
        var fyYear = GetFyStart().Year;

        var sql = @"
INSERT INTO platform.voucher_counters (firm_id, branch_id, counter_key, fy_year, next_no)
VALUES ({0}, {1}, {2}, {3}, 1)
ON CONFLICT (firm_id, branch_id, counter_key, fy_year)
DO UPDATE SET next_no = platform.voucher_counters.next_no + 1
RETURNING next_no;";
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        // RLS: raw connection bypasses EF interceptor — set tenant context before write.
        await Namokara.Api.Common.Db.TenantContextSetter.ApplyAsync(conn, firmId, branchId);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = string.Format(sql,
            $"'{firmId}'::uuid", $"'{branchId}'::uuid", "'voucher.journal'", fyYear);
        var result = await cmd.ExecuteScalarAsync();
        var nextNo = Convert.ToInt64(result);
        return $"{prefix}J{nextNo:D4}";
    }

    private static DateOnly GetFyStart()
    {
        var today = DateTime.Now;
        return today.Month >= 4
            ? new DateOnly(today.Year, 4, 1)
            : new DateOnly(today.Year - 1, 4, 1);
    }

    private static ImportResult Summarize(List<ImportRowResult> rows)
    {
        var success = rows.Count(r => r.Ok);
        return new ImportResult(rows.Count, success, rows.Count - success, rows);
    }
}
