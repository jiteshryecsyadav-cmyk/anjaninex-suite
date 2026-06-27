using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Namokara.Api.Modules.Ai.Services;

namespace Namokara.Api.Modules.Ai.Controllers;

// =============================================================================
// ANJI VOICE — Sarvam AI TTS for the help-desk assistant.
// Har authed user feature hai (sirf Anji ki natural awaaz ke liye) — isliye
// ye AiController ke ai_scan module gate se ALAG hai (Anji sab ko milta hai).
// Sarvam key na ho / Sarvam fail ho → 204 No Content → frontend apne aap browser
// Web Speech voice par fallback ho jaata hai (Anji kabhi nahi tootta).
// =============================================================================
public record TtsRequest(string? Text, string? Lang, string? Voice);
public record AssistantAskRequest(string? Question, string? PageContext, string? Lang);

[ApiController]
[Route("api/ai")]
[Authorize]
public class AnjiVoiceController : ControllerBase
{
    private readonly ISarvamTtsService _tts;
    private readonly IAnjiAssistantService _assistant;
    private readonly ILogger<AnjiVoiceController> _log;

    public AnjiVoiceController(ISarvamTtsService tts, IAnjiAssistantService assistant, ILogger<AnjiVoiceController> log)
    {
        _tts = tts;
        _assistant = assistant;
        _log = log;
    }

    // POST api/ai/assistant  { question, pageContext?, lang? }  → { answer }
    // 204 No Content jab Gemini key na ho ya fail ho → frontend FAQ keyword-match fallback.
    // Sab authed users ke liye open (ai_scan module gate se alag) — Anji sab ko milta hai.
    [HttpPost("assistant")]
    public async Task<IActionResult> Assistant([FromBody] AssistantAskRequest body, CancellationToken ct)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Question))
            return NoContent();
        try
        {
            var answer = await _assistant.AnswerAsync(
                body.Question, body.PageContext ?? "", body.Lang ?? "hi", ct);
            if (string.IsNullOrWhiteSpace(answer))
                return NoContent();   // no key / fail → frontend FAQ fallback
            return Ok(new { answer });
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Assistant ask failed — frontend FAQ fallback karega");
            return NoContent();
        }
    }

    // POST api/ai/tts  { text, lang? }  → { audios: [base64 wav, ...] }
    // 204 No Content jab Sarvam key na ho ya Sarvam fail ho → browser voice fallback.
    [HttpPost("tts")]
    public async Task<IActionResult> Tts([FromBody] TtsRequest body, CancellationToken ct)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Text))
            return NoContent();

        try
        {
            var audios = await _tts.SynthesizeAsync(body.Text, body.Lang ?? "hi", body.Voice ?? "female", ct);
            if (audios is null || audios.Count == 0)
                return NoContent();   // no key / Sarvam error → frontend browser voice fallback

            return Ok(new { audios });
        }
        catch (Exception ex)
        {
            // Anji kabhi nahi tootta — koi bhi error par 204 → browser voice fallback.
            _log.LogWarning(ex, "Anji TTS failed — frontend browser voice par fallback karega");
            return NoContent();
        }
    }
}
