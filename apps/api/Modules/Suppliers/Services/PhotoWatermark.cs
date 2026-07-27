using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Namokara.Api.Modules.Suppliers.Services;

// =============================================================================
// Photo watermark — bot/lib/watermark.js ka .NET roop (wahi patti, wahi label).
// Neeche gehri-purple patti + "Firm · NAM 9876 · 02-Jun 15:30 · ₹699/mtr".
// Kaam: buyer photo aage forward kare to bhi pata rahe kiski hai, kis rate ki hai —
// aur koi seedha supplier se deal na kar le.
// =============================================================================
public static class PhotoWatermark
{
    // "ANJ 9876 · 02-Jun 15:30 · ₹699/mtr" — naam ke 3 akshar + phone ke pehle 4 digit
    public static string BuildLabel(string? name, string? phone, decimal rate, string? unit)
    {
        var nm = new string((name ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray());
        nm = (nm.Length > 3 ? nm[..3] : nm).ToUpperInvariant();
        if (nm.Length == 0) nm = "BZR";
        var ph = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (ph.Length > 4) ph = ph[..4];
        var ist = DateTime.UtcNow.AddMinutes(330);   // India time
        var dt = ist.ToString("dd-MMM HH:mm", System.Globalization.CultureInfo.InvariantCulture);
        var rt = rate > 0 ? $"₹{rate:0.##}{(string.IsNullOrEmpty(unit) ? "" : "/" + unit)}" : "";
        return string.Join(" · ", new[] { nm, ph, dt, rt }.Where(s => !string.IsNullOrEmpty(s)));
    }

    private static FontFamily? PickFamily()
    {
        foreach (var pref in new[] { "DejaVu Sans", "Liberation Sans", "Noto Sans", "Segoe UI", "Arial", "Ubuntu" })
            if (SystemFonts.TryGet(pref, out var fam)) return fam;
        foreach (var fam in SystemFonts.Families) return fam;   // jo bhi mile
        return null;
    }

    // Original bytes → watermarked JPEG bytes. Font/na-mile to caller catch karega
    // (fail-soft: original photo hi chali jayegi, flow rukega nahi).
    public static byte[] Apply(byte[] original, string firmPrefix, string label)
    {
        var famOpt = PickFamily() ?? throw new InvalidOperationException("Koi system font nahi mila");

        using var img = Image.Load<Rgba32>(original);
        int w = img.Width, h = img.Height;
        int barH = Math.Max(40, (int)Math.Round(h * 0.07));
        var font = famOpt.CreateFont((float)(barH * 0.42), FontStyle.Bold);
        var text = $"{firmPrefix} · {label}";

        img.Mutate(ctx =>
        {
            // Patti solid-si (0.92) — forward hone par bhi detect ho sake (HasWatermark)
            ctx.Fill(SixLabors.ImageSharp.Color.FromRgba(45, 16, 64, 235),
                     new RectangleF(0, h - barH, w, barH));
            ctx.DrawText(text, font, SixLabors.ImageSharp.Color.White,
                         new PointF(14, h - barH + barH * 0.22f));
        });

        using var ms = new MemoryStream();
        img.SaveAsJpeg(ms, new JpegEncoder { Quality = 85 });
        return ms.ToArray();
    }

    // Photo me humari patti hai kya? (neeche ki patti ka average color — koi AI nahi)
    // Buyer humari hi bheji photo wapas bheje to use "buyer" samjha jaye.
    public static bool HasWatermark(byte[] bytes)
    {
        try
        {
            using var img = Image.Load<Rgba32>(bytes);
            int w = img.Width, h = img.Height;
            if (w == 0 || h == 0) return false;
            int barH = Math.Max(20, (int)Math.Round(h * 0.07));

            double r = 0, g = 0, b = 0; long px = 0;
            for (int y = h - barH; y < h; y++)
                for (int x = 0; x < w; x += 4)   // har 4th pixel — kaafi hai, tez bhi
                {
                    var p = img[x, y];
                    r += p.R; g += p.G; b += p.B; px++;
                }
            if (px == 0) return false;
            r /= px; g /= px; b /= px;

            var avg = (r + g + b) / 3;
            return avg < 115 && b >= g - 5 && r >= g - 5;   // gehri + purple-si
        }
        catch { return false; }
    }
}
