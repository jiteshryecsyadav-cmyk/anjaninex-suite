namespace Namokara.Api.Common.Text;

/// <summary>
/// Naam/word formatting — har word ka pehla letter CAPITAL, baki small.
/// "JITESH YADAV" → "Jitesh Yadav", "monu pandey" → "Monu Pandey",
/// "shiv-sagar silk mills" → "Shiv-Sagar Silk Mills".
/// GST/PAN/email/codes par use NA karein.
/// </summary>
public static class NameCase
{
    public static string TitleCase(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return s ?? "";
        var t = s.Trim().ToLowerInvariant();
        var chars = t.ToCharArray();
        var newWord = true;
        for (var i = 0; i < chars.Length; i++)
        {
            if (char.IsLetter(chars[i]))
            {
                if (newWord) { chars[i] = char.ToUpperInvariant(chars[i]); newWord = false; }
            }
            else
            {
                // space, -, /, . , ( ke baad naya word
                newWord = chars[i] == ' ' || chars[i] == '-' || chars[i] == '/'
                       || chars[i] == '.' || chars[i] == '(' || chars[i] == '&';
            }
        }
        return new string(chars);
    }

    /// <summary>Nullable version — null ko null hi rehne do.</summary>
    public static string? TitleCaseOrNull(string? s)
        => string.IsNullOrWhiteSpace(s) ? s : TitleCase(s);
}
