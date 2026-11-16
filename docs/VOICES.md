# Voices

## Providers

| provider | languages | timings | status |
|---|---|---|---|
| `kokoro` | English | token timestamps from Kokoro | existing fixture path, unchanged |
| `elevenlabs` | Hindi + 29+ languages | character alignment from the with-timestamps endpoint | implemented; live call blocked by a missing key on 2026-11-17 |

`project.json` voice shape:

```json
{
  "provider": "elevenlabs",
  "model": "eleven_multilingual_v2",
  "voiceId": "…",
  "language": "hi",
  "settings": { "stability": 0.5, "similarity_boost": 0.75, "style": 0, "use_speaker_boost": true, "speed": 1 },
  "maxCharsPerRun": 10000
}
```

Legacy English projects keep `{ "engine": "kokoro", "voice": "am_michael", "speed": 1.35 }`. The stage reads
`provider ?? engine`; Kokoro is English-only.

## ElevenLabs — verified against the current docs (2026-11-17)

Sources:

- <https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps>
- <https://elevenlabs.io/docs/models>
- <https://elevenlabs.io/pricing/api>
- <https://elevenlabs.io/docs/api-reference/voices/search>

### Endpoint and response

`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=…` with the `xi-api-key`
header and JSON body `text`, `model_id`, `voice_settings`, optional `language_code`, `previous_text`, `next_text`,
`previous_request_ids`, `next_request_ids`, `seed` and `apply_text_normalization`.

Response:

```json
{
  "audio_base64": "…",
  "alignment": { "characters": ["…"], "character_start_times_seconds": [0], "character_end_times_seconds": [0.1] },
  "normalized_alignment": { "characters": ["…"], "character_start_times_seconds": [0], "character_end_times_seconds": [0.1] }
}
```

`alignment` is for the original text; `normalized_alignment` is for the text after ElevenLabs text normalisation
(numbers, abbreviations). The provider uses the original alignment when its characters join exactly to the block text,
otherwise the normalized alignment, matches words by the shared Unicode normaliser, and interpolates any word whose
timing cannot be mapped (with a warning in the run log and the stage result).

### Stitching

For continuity across requests the docs offer `previous_text` / `next_text` and `previous_request_ids` /
`next_request_ids` (maximum 3 ids; request ids win if both are sent). The provider sends the text of the adjacent beat
blocks (500 characters each side) for **multilingual v2 / flash**. The live v3 test returned HTTP 400:
`Providing previous_text or next_text is not yet supported with the 'eleven_v3' model.` The provider therefore omits
text stitching for v3/v4; v3 relies on its audio tags and punctuation. Beat blocks are consecutive script lines with
the same beat; a 0.26 s local pause is inserted between blocks (Kokoro's `BEAT_GAP`).

### Voice settings

| setting | range / default |
|---|---|
| `stability` | 0–1, default 0.5 (lower = more emotional variation) |
| `similarity_boost` | 0–1, default 0.75 |
| `style` | 0–1, default 0 |
| `use_speaker_boost` | boolean, default true |
| `speed` | REST accepts a wide range; the product UI/Agents limit is 0.7–1.2. The provider clamps to 0.7–1.2. |
| `apply_text_normalization` | `auto` (default), `on`, `off` |

`language_code` is optional and **not supported by `eleven_multilingual_v2`**; the provider omits it for that model
and sends `hi` for other Hindi-capable models.

### Hindi models

From the model table:

| model id | Hindi | notes |
|---|---|---|
| `eleven_multilingual_v2` | yes | default, 29 languages, 10,000-char request limit, most stable for long form |
| `eleven_flash_v2_5` | yes | 32 languages, 40,000-char limit, lower price |
| `eleven_v3` | yes | 70+ languages, 5,000-char limit, expressive |
| `eleven_v3_conversational` | yes | low-latency v3, 70+ languages |
| `eleven_v4` / `eleven_v4_turbo` | yes | 90+ languages; the models page documents v4 through the Text to Dialogue API, so this provider does not default to it |

### Output formats and plans

The endpoint default is `mp3_44100_128`. MP3 192 kbps needs Creator or above; PCM/WAV at 44.1 kHz needs Pro or above.
The provider defaults to `mp3_44100_128` (works on every plan), converts with ffmpeg to **24 kHz mono PCM WAV** for
`audio/mix.py`, and supports `voice.settings.outputFormat` for tests/other plans.

### Prices (USD, API, 2026-11-17)

| models | per 1,000 characters |
|---|---:|
| v4, v3, v2 Multilingual (`eleven_multilingual_v2`) | $0.08 |
| v4 Turbo, v3 Conversational, Flash/Turbo (`eleven_flash_v2_5`) | $0.04 |

Source: <https://elevenlabs.io/pricing/api>. The repo stores these as `models.json` `voicePrices.elevenlabs` and
computes `costUsd = characters / 1000 × price`. A cached take bills **0** characters and **$0**.

### Cache, budget and log

Every take is cached under `.fableon/voice-cache/<sha256>.json` keyed by provider, model, voice id, text, voice
settings, output format and stitching context. `voice.maxCharsPerRun` (default 10,000) is checked before a live call;
cached hits do not count. Each call appends one line to `logs/calls.jsonl` with stage `voice`, provider, model, voice
id, request hash, `cached`, `characters`, `costUsd`, ms and ok — never the text or the key.

## Live status

On 2026-11-17 `fableon voice check --provider elevenlabs` printed:

```text
provider: elevenlabs
key: SET (ELEVENLABS_API_KEY)
model: eleven_multilingual_v2
voice: EXAVITQu4vr4xnSDxMaL
characters billed: 28
cost: $0.002240
  नमस्ते  0.00s-0.67s (line 0)
  यह  0.70s-0.80s (line 0)
  आवाज़  0.85s-1.08s (line 0)
  की  1.10s-1.17s (line 0)
  जाँच  1.22s-1.42s (line 0)
```

The check synthesizes `नमस्ते, यह आवाज़ की जाँच है।` with Sarah (`EXAVITQu4vr4xnSDxMaL`), a premade voice whose
`verified_languages` include Hindi in this account. The first attempt used the public Rachel id
`21m00Tcm4TlvDq8ikWAM`, which returned HTTP 404 because it is not available to this account; the default check voice
is now Sarah. No key is printed, logged or cached.

The account lists 21 premade voices; `/v2/voices?language=hi` filters on the `language` label and returned 0 even
though some voices have `verified_languages` containing `hi`. Auditions therefore filter account voices locally on
`verified_languages`, and use `/v1/shared-voices?language=hi&use_cases=narrative_story`, which does return the shared
Hindi narration library.

### Delivery direction (2026-11-17)

`script.json` lines may carry `delivery: {tone, pauseBefore, pauses, emphasis}`. Model support, verified against the
current docs and the round-2 live run:

| control | eleven_multilingual_v2 | eleven_v3 |
|---|---|---|
| pause | SSML `<break time="x.xs" />`, up to 3 s | no SSML break; use `[pause]`, `...` or punctuation |
| tone | per-request `voice_settings` (stability/style/speed) | audio tags such as `[sarcastic]`, `[warmly]`, `[excited]`, `[nervously]`, `[softly, with wonder]`, `[whispers]` |
| emphasis | 0.12 s `<break>` before the word | leading ellipsis before the word |
| stitching | `previous_text` / `next_text` | not supported (HTTP 400) |

`deadpan` and `matter-of-fact` use no v3 tag (the model has no documented flat-delivery tag); the deadpan pair is
carried by its good-news/bad-news wording, the 0.5 s local pause before each line and the emphasis mark. The API does
not expose a v3 “stability mode” field, so `voice.tones` stores `stability`, `style` and `speed` for both models.

Pauses before punchlines are inserted as exact local silence (the model tags do not guarantee a duration); in-line
pauses use the model's break/tag. The alignment builder strips `[tags]` and `<break>` markup before building
`words.json`, and tests assert every spoken word keeps monotonic timings.

### Round-2 delivery auditions (2026-11-17)

A six-line Savitri excerpt with delivery marks was synthesized in two variants with Callum × multilingual v2,
Callum × v3 and George × v3, plus a Callum × v3 **clean** control with no marks. Default uses the base tone settings;
expressive uses stability 0.25 / style 0.35. The excerpt's hook, deadpan good-news/bad-news pair and twist each carry a
0.4–0.5 s local pause and emphasis.

**7 takes, 2,965 characters (rendered), $0.2372.** Files are in `work/savitri-hi/voice/auditions/round2/` with
`round2.md`; the mp3s are not committed.

### Auditions (2026-11-17)

`fableon voice audition --project work/savitri-hi --voices 5` used the same 102-character Hindi sample on five account
voices and three Hindi TTS models:

| voice | id | model set |
|---|---|---|
| George - Warm, Captivating Storyteller | `JBFqnCBsd6RMkjVDRZzb` | multilingual v2 / flash v2.5 / v3 |
| Alice - Clear, Engaging Educator | `Xb7hH8MSUJpSbSDYk0k2` | multilingual v2 / flash v2.5 / v3 |
| Brian - Deep, Resonant and Comforting | `nPczCjzI2devNBz1zQrb` | multilingual v2 / flash v2.5 / v3 |
| Callum - Husky Trickster | `N2lVS1w4EtoT3dr4eOWO` | multilingual v2 / flash v2.5 / v3 |
| Chris - Charming, Down-to-Earth | `iP95p4xoKVk53GoZ742B` | multilingual v2 / flash v2.5 / v3 |

15 takes, 1,530 characters, **$0.1020**, written to `work/savitri-hi/voice/auditions/` with
`auditions.md`. The shared library query returned 3,525 Hindi narrative voices; one library voice not owned by the
account returned HTTP 402 (`Free users cannot use library voices via the API`), so library voices were excluded from
the audition set. The mp3s stay in `work/` and are not committed.
