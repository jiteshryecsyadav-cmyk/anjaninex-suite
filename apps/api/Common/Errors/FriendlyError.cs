using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Namokara.Api.Common.Errors;

/// <summary>
/// Converts technical exceptions (Postgres errors, EF DbUpdateException, etc.) into
/// SIMPLE Hinglish messages that an end-user can understand.
///
/// Example: instead of
///   "23505: duplicate key value violates unique constraint idx_bills_no_fy"
/// the user sees
///   "Ye bill number pehle se maujood hai. Page refresh karke dobara try karein."
///
/// Used by the global exception middleware AND directly in controller catch blocks
/// so EVERY module (Bill, Order, Payment, Commission, Accounts, HR, Party...) shows
/// friendly messages.
/// </summary>
public static class FriendlyError
{
    /// <summary>
    /// Walk to the root exception, detect Postgres SQLSTATE + constraint name, and
    /// return a simple Hinglish message. Falls back to the exception message for
    /// app-level validation errors (ArgumentException etc. — these are already friendly).
    /// </summary>
    public static string From(Exception ex)
    {
        // Unwrap to the innermost exception (EF wraps the real DB error).
        var root = ex;
        while (root.InnerException != null) root = root.InnerException;

        // 1. Postgres errors — translate by SQLSTATE + constraint name.
        if (root is PostgresException pg)
            return FromPostgres(pg);

        // 2. App-level validation exceptions are written by us and already readable.
        if (ex is ArgumentException || ex is InvalidOperationException)
            return ex.Message;
        if (root is ArgumentException || root is InvalidOperationException)
            return root.Message;

        // 3. EF generic save failure with no clearer inner detail.
        if (ex is DbUpdateException)
            return "Data save nahi ho paya. Kuch field galat ya duplicate ho sakta hai. Dobara check karke try karein.";

        // 4. Anything else — generic safe fallback (never expose stack traces).
        return "Kuch galat ho gaya. Dobara try karein. Agar phir bhi ho to support se baat karein.";
    }

    private static string FromPostgres(PostgresException pg)
    {
        var c = (pg.ConstraintName ?? "").ToLowerInvariant();

        switch (pg.SqlState)
        {
            // ── 23505: unique_violation (duplicate) ──
            case "23505":
                if (c.Contains("comm_inv_lines_bill"))
                    // Migration 98 — ek bill ka commission sirf ek baar. Dobara try
                    // karne se bhi wahi hoga, isliye user ko purane invoice ki taraf bhejo.
                    return "Is bill ka commission PEHLE SE ban chuka hai — dobara nahi banega. " +
                           "Commission list me purana invoice dekhein; galat laga ho to use Delete karke phir banayein.";
                if (c.Contains("bills_no") || c.Contains("bill_no"))
                    return "Ye bill number pehle se maujood hai. Page refresh karke dobara save karein.";
                if (c.Contains("voucher"))
                    return "Ye voucher number pehle se maujood hai. Dobara try karein.";
                if (c.Contains("commission") || c.Contains("invoice"))
                    return "Ye invoice number pehle se maujood hai. Dobara try karein.";
                if (c.Contains("supplier_bill") || c.Contains("dup"))
                    return "Ye bill pehle se save hai (same supplier + bill no + date). Duplicate allowed nahi.";
                if (c.Contains("gst"))
                    return "Is GST number par party pehle se save hai. Existing party use karein.";
                if (c.Contains("order_no") || c.Contains("orders"))
                    return "Ye order number pehle se maujood hai. Dobara try karein.";
                if (c.Contains("payment") || c.Contains("receipt"))
                    // "Dobara try karein" nahi likhte — dobara karne se bhi wahi hoga.
                    // User ko batao ki receipt SAVE HO CHUKI hai, nayi banane ki zaroorat nahi.
                    return "Is number ki receipt pehle se maujood hai — dobara nahi banegi. " +
                           "Receipt List me dekhein: shayad wo save ho chuki hai. " +
                           "Badalna ho to usi ko kholkar Edit karein.";
                if (c.Contains("email"))
                    return "Ye email pehle se registered hai.";
                if (c.Contains("phone") || c.Contains("mobile"))
                    return "Ye phone number pehle se registered hai.";
                if (c.Contains("code"))
                    return "Ye code pehle se maujood hai. Alag code use karein.";
                return "Ye entry pehle se maujood hai (duplicate). Dobara try karein.";

            // ── 23503: foreign_key_violation ──
            case "23503":
                if (c.Contains("branch"))
                    return "Selected branch valid nahi hai. Upar se sahi branch select karke dobara try karein.";
                if (c.Contains("party"))
                    return "Selected party valid nahi hai (ya delete ho chuki hai). Party dobara select karein.";
                if (c.Contains("bill"))
                    return "Ek ya zyada selected bill ab valid nahi hai (delete ho chuki hai). Page refresh karke bills dobara fetch karein.";
                return "Selected party/item/account valid nahi hai (ya delete ho chuka hai). Dobara select karein.";

            // ── 23502: not_null_violation ──
            case "23502":
                var col = (pg.ColumnName ?? "").Replace("_", " ");
                return string.IsNullOrEmpty(col)
                    ? "Koi zaroori field khali hai. Saare * (mandatory) fields bharein."
                    : $"'{col}' field bharna zaroori hai.";

            // ── 23514: check_violation (CHECK constraint — bad format/value) ──
            case "23514":
                if (c.Contains("gst"))
                    return "GST number ka format galat hai. 15-char sahi GSTIN daalein (ya URP party banayein).";
                if (c.Contains("pan"))
                    return "PAN number ka format galat hai (e.g. AABCO5612R).";
                if (c.Contains("status"))
                    return "Status value galat hai.";
                return "Kisi field ki value sahi nahi hai. Check karke dobara try karein.";

            // ── 22001: string too long ──
            case "22001":
                return "Kisi field me bahut zyada text hai. Chhota karke try karein.";

            // ── 22P02 / 22003: invalid number / out of range ──
            case "22P02":
            case "22003":
                return "Kisi number/value ka format galat hai. Check karke dobara try karein.";

            // ── 40001 / 40P01: serialization / deadlock — transient ──
            case "40001":
            case "40P01":
                return "Server busy tha, transaction retry karein. Dobara save karein.";

            // ── 57014: query canceled / timeout ──
            case "57014":
                return "Operation me zyada time lag gaya (timeout). Dobara try karein.";

            // ── 42501: insufficient_privilege (RLS / row-level security block) ──
            case "42501":
                return "Security policy ne ye save block kiya (firm permission). Ek baar logout-login karke try karein; phir bhi ho to support ko batayein. (code 42501)";

            // ── P0001: custom trigger error (raise exception) — usually a clear message ──
            case "P0001":
                return string.IsNullOrWhiteSpace(pg.MessageText)
                    ? "Save rule ne rok diya. Check karke dobara try karein."
                    : pg.MessageText;

            // ── 42P01 / 42703: missing table/column (system update needed) ──
            case "42P01":
            case "42703":
                return "System update chahiye (database table/column missing). Support/admin ko batayein. (code " + pg.SqlState + ")";

            default:
                // Code dikhao taaki support turant root cause pakad sake (SQLSTATE sensitive nahi hota).
                return $"Data save karne me dikkat aayi (code {pg.SqlState}). Check karke dobara try karein. Agar baar baar ho to ye code support ko batayein.";
        }
    }
}
