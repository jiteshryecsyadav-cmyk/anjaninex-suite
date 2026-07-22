using Namokara.Api.Common.Errors;
using Namokara.Api.Common.Text;
using Xunit;

namespace Namokara.Api.Tests;

// =============================================================================
// FriendlyError — user ko KABHI raw technical error nahi dikhna chahiye.
// Ye rule CLAUDE.md ka #3 hai; tests pakka karte hain ki wo toote nahi.
// =============================================================================
public class FriendlyErrorTests
{
    [Fact]
    public void ArgumentException_ka_message_jaisa_ka_taisa()
    {
        // Hamari validation (jaise GST checksum) already Hinglish me likhti hai —
        // usko badalna nahi chahiye.
        var msg = FriendlyError.From(new ArgumentException("GST number galat hai."));
        Assert.Equal("GST number galat hai.", msg);
    }

    [Fact]
    public void Anjaan_exception_par_stack_trace_kabhi_nahi()
    {
        var msg = FriendlyError.From(new NullReferenceException("Object reference not set..."));
        Assert.DoesNotContain("Object reference", msg);
        Assert.DoesNotContain("Exception", msg);
        Assert.Contains("Dobara try karein", msg);
    }

    [Fact]
    public void Andar_lipti_hui_validation_bhi_dikhe()
    {
        // EF aksar asli error ko wrap kar deta hai — innermost message hi dikhna chahiye.
        var inner = new InvalidOperationException("Party ka ledger nahi mila.");
        var msg = FriendlyError.From(new Exception("outer", inner));
        Assert.Equal("Party ka ledger nahi mila.", msg);
    }
}

// NameCase — party ke naam har jagah ek jaise dikhne chahiye
public class NameCaseTests
{
    [Theory]
    [InlineData("KAUSHAL CLOTH STORES", "Kaushal Cloth Stores")]
    [InlineData("kala shree fabrics pvt. ltd.", "Kala Shree Fabrics Pvt. Ltd.")]
    public void Naam_title_case_me(string input, string expected)
        => Assert.Equal(expected, NameCase.TitleCase(input));

    [Fact]
    public void Null_par_null()
        => Assert.Null(NameCase.TitleCaseOrNull(null));
}
