using Namokara.Api.Modules.Trading.Services;
using Xunit;

namespace Namokara.Api.Tests;

// =============================================================================
// GST CHECKSUM — "ek letter ka typo pakda nahi jata tha" wale bug ka pehredaar.
//
// Asli case: "Khatri Balkrishna Prathurai (New)" 09AWPPR0622D1ZN se ban gayi
// thi jabki asli GST 09AWPPM0622D1ZN tha (5th letter M→R). Format regex dono ko
// sahi maanta hai — sirf check digit farak pakadta hai. Ye tests pakka karte
// hain ki wo rok kabhi dheeli na ho.
// =============================================================================
public class GstChecksumTests
{
    // Production me maujood asli (sahi) GST numbers — inpar rok NAHI lagni chahiye,
    // warna sahi party banna band ho jayegi (usse bada nuksan koi nahi).
    [Theory]
    [InlineData("09AWPPM0622D1ZN")]   // Khattri Balkrishan Prathuraj (asli wala)
    [InlineData("24AMAPV5715B1ZD")]
    [InlineData("24AGEPG9383L3ZY")]
    [InlineData("09AANFR6399G1ZE")]
    [InlineData("09AAJFP1061H1Z9")]
    [InlineData("08AALPL3039R1Z1")]
    [InlineData("08ABBPH8956L1Z5")]
    [InlineData("09ARTPA9220G1ZN")]
    [InlineData("09AAZFG3651L1ZL")]
    [InlineData("09ABTPA0630J1ZP")]
    [InlineData("24AAVPA9686R1ZJ")]
    [InlineData("24AAFHA3954C1ZS")]
    [InlineData("24ABNFM9479K1ZD")]
    [InlineData("32AADCN5324N1ZF")]
    public void Sahi_gst_par_rok_nahi(string gst)
    {
        var ex = Record.Exception(() => PartyService.ValidateGstChecksum(gst));
        Assert.Null(ex);
    }

    [Theory]
    [InlineData("09AWPPR0622D1ZN")]   // wahi asli typo — M ki jagah R, checksum fail
    [InlineData("24AMAPV5715B1ZA")]   // aakhri char galat
    [InlineData("24AGEPG9383L3Z1")]   // aakhri char galat
    public void Galat_gst_par_saaf_error(string gst)
    {
        var ex = Assert.Throws<ArgumentException>(() => PartyService.ValidateGstChecksum(gst));
        // User ko Hinglish me samajh aana chahiye ki GST hi galat hai
        Assert.Contains("GST", ex.Message);
        Assert.Contains("galat", ex.Message);
    }
}
