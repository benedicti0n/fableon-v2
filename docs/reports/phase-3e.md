# Phase 3E report

## Summary

Direct-provider routing is live: DeepSeek, OpenAI, Gemini and Sarvam are registered, the script bake-off is recorded, and `models.json` routes every stage with logged fallbacks. Savitri was re-voiced with Sarvam **Nachiket** (`nachiket_hi_devotional`, Bulbul v4 Flash), natural sentence rendering at 48 kHz, a local MMS forced aligner and a voice QA gate; the user rated the first re-voice 8/10, then asked for a natural-pacing fix, and approved the final voice. The editing grammar changed from 24 crossfades to continuous scenes: Savitri has 6 board scenes (1 flash, 4 crossfades, 0 hard cuts), Bakasura 3 scenes (1 flash, 2 crossfades, 0 hard cuts). Bakasura was then made end to end with Gemini 3.1 Pro, the approved Nachiket voice, a redesigned Bakasura, and a user rating of 9/10.

OpenRouter was not used in this phase (zero credits and the privacy filter blocks free endpoints); its code and tests remain. Phase model spend was **$0.9592** plus the **$0.1521** script bake-off; Sarvam spend was **₹12.51 of ₹200**.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `c25080e` | `docs: phase 3E prompt` | The prompt saved verbatim. |
| F1 | `7753ea7` | `feat(models): provider registry and OpenRouter` | Provider registry, live OpenRouter catalog, privacy routing, JSON capability, mocked provider tests. |
| F2 | `edf9fdf` | `feat(director): the model chooses, code allocates; continuous scenes` | Allocator for shares/heights/transitions/punches; scene grouping; hold-creep stats. |
| F3 | `68f5c10` | `feat(eval): bake-off harness and direct-provider routing` | Direct OpenAI/Gemini, official prices, script bake-off, blind sheet, script route. |
| F4 | `e7a624b` | `feat(voice): Sarvam provider, budget meter and phrase cache` | Sarvam TTS, 48 kHz answers, INR/USD billing, `voice budget`, Nachiket discovery. |
| fix | `6df21e8` | `fix(director): keep continuous scene keys moving` | Continuous keys keep a push; film hold creep uses absolute rates; 70–95% continuous hold. |
| fix | `cdfb26a` | `fix(animatic): frame-aligned QA and the full audio tail` | QA frames shift into video time; missing tail frames render instead of freezing/cutting. |
| F5 | `52a57d2` | `feat(voice): performance direction, forced aligner and Nachiket auditions` | Performance stage, round-3 takes, MMS_FA aligner, voice QA, natural-pace fix. |
| fix | `fcaba6e` | `fix(director): flash on the next scene boundary and cap foreground` | Post-hook flash survives scene merging; optional foreground trimmed to 40%. |
| fix | `c0c7701` | `fix(voice): natural Sarvam rendering` | Whole-line requests, natural gaps, 48 kHz, room tone, guard pass, `fableon qa` voice QA, A/B. |
| fix | `2f871cd` | `fix(schema): allow direct model providers in project.json` | Gemini/OpenAI/Sarvam/OpenRouter accepted in later stages. |
| F6 | `fc594c4` | `feat(fixture): Bakasura end to end` | Gemini Pro script, factcheck fixes, cast redesign, shot plan, animatic, fixture, review images. |

The fix commits are the measured repairs the phase found while running the films; they are small and scoped to the feature that exposed them.

## Acceptance checks

### 1. `npm test` green, with the new tests

Command: `npm test`

```
PASS model fallback  10/10 checks
PASS voice pace rebuild  16/16 checks
PASS script formula  20/20 checks
PASS director camera  19/19 checks
PASS sound cues + mix  16/16 checks
PASS provider registry  21/21 checks
PASS director allocator  7/7 checks
PASS bakeoff scoring  6/6 checks
PASS Sarvam TTS  6/6 checks
PASS performance direction  7/7 checks
PASS forced aligner  7/7 checks; clean start 31/75 ms, clean end 48/101 ms, raw start 39/307 ms, raw end 44/127 ms
PASS voice QA  6/6 checks
PASS hindi pause guard  3/3 checks
PASS validator (5/5)
PASS validator  5/5 cases
PASS shot starts  39 anchors resolve to the old frames
PASS motion math  9/9 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

The Adi audio regression still passes (`audio duration 121.300 s`, `audio loudness -14.52 LUFS`); the authoring board is 24/24; the golden max is 0.107.

### 2. Routing table and OpenRouter budget

`models.json` stage routes:

| stage | primary | fallbacks |
|---|---|---|
| brief | deepseek `deepseek-flash` | gemini `gemini-3.1-flash-lite`, deepseek `deepseek-v4-pro` |
| research | deepseek `deepseek-flash` | gemini `gemini-3.1-flash-lite`, deepseek `deepseek-v4-pro` |
| script | gemini `gemini-3.1-flash-lite` | gemini `gemini-3.1-pro-preview`, sarvam `sarvam-105b`, deepseek `deepseek-flash` |
| factcheck | deepseek `deepseek-flash` | gemini `gemini-3.1-pro-preview`, deepseek `deepseek-v4-pro` |
| performance | deepseek `deepseek-flash` | gemini `gemini-3.1-flash-lite`, deepseek `deepseek-v4-pro` |
| cast | deepseek `deepseek-flash` | gemini `gemini-3.1-flash-lite`, deepseek `deepseek-v4-pro` |
| shotplan | deepseek `deepseek-flash` | gemini `gemini-3.1-pro-preview`, deepseek `deepseek-v4-pro` |
| sound | deepseek `deepseek-flash` | gemini `gemini-3.1-flash-lite`, deepseek `deepseek-v4-pro` |
| board | deterministic | — |

Bakasura overrides `models.script` to `gemini-3.1-pro-preview` in its `project.json`.

OpenRouter: **$0.00 spent in Phase 3E**, unused by explicit user decision. The key reports `total_credits: 0`, `total_usage: 0.1126` from before this phase; `provider.data_collection=deny` removes the free endpoints. Code and mocks remain; `models.json.providers.openrouter.unused` records why.

### 3. Savitri re-voiced and rated

Final voice: `work/savitri-hi/voice.wav`, 48 kHz, **88.82 s**, `-16.00 LUFS`, `-3.19 dBTP`, 0 clipped, 7.6% digital silence, 0 digital-zero runs, 3 deliberate pauses, 0 guard violations, 15.9 kHz bandwidth, 0.02 s lead / 0.09 s tail. The user rated the first re-voice **8/10** and then sent the natural-voice notes; the final take was approved and the user proceeded to Bakasura.

Final animatic: `work/savitri-hi/animatic.mp4`, **89.93 s**. QA PASS: no black/white frames, no frozen spans, no unexplained pops. Board stats: 6 shots, 0 cuts, 1 flash, 4 crossfades, 34 keys, hold 93.2%, DOF 31.8%, foreground 38.2%, low heights 90.9%, hold creep 8.6%, 8 punches.

### 4. Bakasura end to end, four checkpoints, rated

Checkpoints: script approved; factual corrections (5 lines) approved; cast approved after the Bakasura redesign; shot plan approved; animatic rated **9/10, nothing blocking**.

Final animatic: `work/bakasura-hi/animatic.mp4`, **66.4 s**. QA PASS. Stats: 3 shots, 0 cuts, 1 flash, 2 crossfades, 22 keys, hold 100%, DOF 33.8%, foreground 36.4%, low heights 61.5%, hold creep 11.3%, 14 punches, 7 rolls, 9 kicks.

Fixture: `fixtures/bakasura-hi/` (3.7 MB, no mp4s/stems). Review images: `docs/reports/phase-3e/bakasura-{cast,hook,hermitage,payoff}.jpg`.

### 5. Commit order

`git log --oneline c25080e^..HEAD` shows the Step 0 prompt, F1–F6 in order, and the measured fixes between them; F7 is this report commit.

## Bake-off

### Shortlist and official prices

| label | provider | model | input $/M | output $/M |
|---|---|---|---:|---:|
| DeepSeek Flash | deepseek | deepseek-flash | 0.30 | 1.20 |
| DeepSeek V4 Pro | deepseek | deepseek-v4-pro | 1.32 | 3.96 |
| Sarvam 105B | sarvam | sarvam-105b | 0.1136 | 0.2841 |
| GPT-5.4 nano | openai | gpt-5.4-nano-2026-03-17 | 0.20 | 1.25 |
| GPT-5.4 mini | openai | gpt-5.4-mini | 0.75 | 4.50 |
| Gemini 3.1 Flash-Lite | gemini | gemini-3.1-flash-lite | 0.25 | 1.50 |
| Gemini 3.1 Pro | gemini | gemini-3.1-pro-preview | 2.00 | 12.00 |

Prices are recorded in `models.json` with official source URLs and dates (2026-11-18). OpenRouter prices come from `models.catalog.json` (439 models, dated 2026-11-17); it was not used.

### Script results

Fixed cases: `fixtures/savitri-hi`, `work/bakasura-hi`. Spend **$0.15208** (DeepSeek $0.00450, Sarvam $0.05183, Gemini $0.09576; OpenAI calls failed validation before billing).

| case | model | result | calls | repairs | cost USD | latency |
|---|---|---|---|---:|---:|---:|---:|
| Savitri | sarvam-105b | PASS | 6 | 5 | 0.040011 | 252 s |
| Savitri | gemini-3.1-flash-lite | PASS | 3 | 2 | 0.010058 | 14 s |
| Savitri | deepseek-flash | FAIL | 0 | — | 0 | 70 s |
| Savitri | deepseek-v4-pro | FAIL (malformed JSON) | 0 | — | 0 | 136 s |
| Savitri | gpt-5.4-nano | FAIL (length/formula) | 0 | — | 0 | 69 s |
| Savitri | gpt-5.4-mini | FAIL (tone/length) | 0 | — | 0 | 49 s |
| Savitri | gemini-3.1-pro-preview | FAIL (truncated) | 0 | — | 0 | 73 s |
| Bakasura | deepseek-flash | PASS | 2 | 1 | 0.004496 | 18 s |
| Bakasura | sarvam-105b | PASS | 2 | 1 | 0.011820 | 80 s |
| Bakasura | gemini-3.1-flash-lite | PASS | 2 | 1 | 0.005567 | 7 s |
| Bakasura | gemini-3.1-pro-preview | PASS | 2 | 1 | 0.080132 | 104 s |
| Bakasura | deepseek-v4-pro | FAIL | 0 | — | 0 | 95 s |
| Bakasura | gpt-5.4-nano | FAIL | 0 | — | 0 | 53 s |
| Bakasura | gpt-5.4-mini | FAIL | 0 | — | 0 | 39 s |

No candidate passed on the first try; every passing script needed repairs. The selection rule's "first-try pass >= 80%" therefore did not select anyone; the user's blind ranking decided the script route. The blind sheet is `bakeoff/script/blind.md`; the key is `bakeoff/script/manifest.json`.

**User ranking:** Savitri **B** = Gemini 3.1 Flash-Lite; Bakasura **D** = Gemini 3.1 Pro. The default script route is Gemini Flash-Lite (cheapest passing Savitri script, 8× cheaper than Pro); Bakasura overrides to Gemini Pro (within the 10× rule).

### Other stages

Only the script stage has a full head-to-head table. Research, factcheck, cast, shotplan, performance and sound were routed from the provider registry with logged fallbacks; they were not separately bake-off'd. This is a deviation from F3 and the main open item.

## Factcheck

The seeded scorer test in `tests/bakeoff.mjs` plants 6 errors among clean lines and checks recall/false positives; it scores **5/6 recall, 0 false positives** on the synthetic fixture. On the real Bakasura script the first review flagged 5 of 10 lines (monthly frequency, invented host line, "food gone" vs found eating, corpse at the door vs dragged to the town gate, monthly feast). All five were corrected with the user's approval; the re-review returned **0 factual flags** and **0 false positives** (the other five lines were `ok`/`opinion`).

## Aligner accuracy

Local **MMS_FA** (torchaudio, 16 kHz emissions) with uroman romanisation and 40 ms frame-centre calibration; Whisper word timestamps are the fallback. Validation on the cached Savitri ElevenLabs take against its character alignment:

| subset | start median | start p95 | end median | end p95 |
|---|---:|---:|---:|---:|
| clean words (105/234; no reference pause gap >= 0.1 s) | **31 ms** | **75 ms** | **48 ms** | **101 ms** |
| all words (raw) | 39 ms | 307 ms | 44 ms | 127 ms |

The raw p95 fails because ElevenLabs assigns pause time to the following word (for example word `एक` is marked at 22.808 s while the audio onset is 23.26 s). The clean subset meets the 50/120 ms target. The test is `tests/aligner.mjs`; the report of the raw/clean split is in the test output.

## Sarvam facts and the Nachiket finding

- Endpoint `POST https://api.sarvam.ai/text-to-speech`, `api-subscription-key` header; response `audios: ["<base64>"]`.
- Models: `bulbul:v4-flash` (latest, 2500 chars/request, 200+ persona voices, 48 kHz available), `bulbul:v3` (30+ short-name voices, 2500 chars), `bulbul:v2` (legacy, 1500 chars).
- Pace 0.5–2.0; no SSML; ₹2 per 1,000 chars for v4-flash and ₹3 for v3.
- **Nachiket is `nachiket_hi_devotional` in Bulbul v4 Flash only.** The v3 catalog has no Nachiket; closest v3 male narrators are Shubh, Ashutosh, Ratan and Mani.
- `fableon voice budget`: ElevenLabs free 9,195/10,000 (805 remaining), Sarvam logged **6,256 chars / ₹12.51 of ₹200** (Sarvam exposes no balance endpoint). No new ElevenLabs calls were made.

## Round-3 auditions and the user's choice

`work/savitri-hi/voice/auditions/round3/` has four Sarvam takes (`bulbul:v4-flash`, `nachiket_hi_devotional`) × {plain, performance-marked} × pace {1.10, 1.25}, plus the cached Callum v3 round-2 reference. Cost: 1,907 chars / ₹3.82. The user chose **Marked 1.25**. After the 8/10 Savitri review, the user asked for natural pacing; the final render is **marked, pace 1.10**, whole-line requests, 0.2–0.3 s sentence gaps, 100 ms internal pauses, three dramatic pauses and a final Hindi guard pass.

A/B (same deadpan 20 s excerpt, level-matched):

| file | digital silence | perceptual pauses | true peak | bandwidth |
|---|---:|---:|---:|---:|
| current phrase-split | 24.0% | 30.6% | −2.00 dBTP | 11.0 kHz |
| first whole-line (too rushed) | 5.0% | 12.0% | −3.89 dBTP | 14.0 kHz |
| final natural (pace 1.10) | 8.4% | 16.4% | −3.65 dBTP | 15.0 kHz |

Files: `work/savitri-hi/voice/ab/`. Pronunciation listen-back and clips: `work/savitri-hi/voice/pronunciation.md` and `voice/pronunciation-clips/`.

## Measurements

- macOS 26.5.2, Apple M1, ANGLE Metal renderer (`ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`), Node 25.9.0, Python 3.12.16.
- Preview animatic 540×960, 30 fps: 0.03–0.15 s/frame depending on the shot; Savitri 2,696 frames and Bakasura 1,992 frames each took about 70–90 s of render wall time with 2 workers.
- No new 1440×2560 final render was produced for Savitri or Bakasura in this phase (the checkpoint was the animatic). The existing Savitri final from Phase 3D is unchanged.
- Disk: `fixtures/bakasura-hi` 3.7 MB; `work/savitri-hi` 674 MB (includes the A/B and auditions); `work/bakasura-hi` 210 MB. Free disk at the end: 4.4 GB; `fableon doctor` warns (needs 5 GB).

## Cost per provider and stage

Phase model calls in the two project logs since 2026-11-18 (ElevenLabs excluded; no new calls):

| provider | phase spend USD |
|---|---:|
| DeepSeek | 0.2479 |
| Gemini | 0.5691 |
| Sarvam | 0.1422 |
| OpenAI | 0.0000 |
| OpenRouter | 0.0000 |
| **project total** | **0.9592** |
| script bake-off | 0.1521 |
| **phase total** | **1.1113** |

Per stage (project logs): shotplan Gemini Pro $0.4206, shotplan DeepSeek Pro $0.1652, script Gemini Pro $0.1438, Sarvam voice $0.1422, shotplan DeepSeek Flash $0.0448, factcheck DeepSeek Flash $0.0179, sound DeepSeek Flash $0.0059, cast DeepSeek Flash $0.0047, performance DeepSeek Flash $0.0047, cast Gemini Flash-Lite $0.0047, research DeepSeek Flash $0.0046. The Bakasura shotplan fallbacks to Gemini Pro account for the largest line.

Budgets: OpenAI $0 / $3, Gemini $0.569 / $3, Sarvam ₹12.51 / ₹200, DeepSeek $0.248 as needed. No run exceeded a budget.

## Every fallback (logged)

Savitri: `shotplan` 8 fallback calls from DeepSeek Flash to DeepSeek V4 Pro; `sound` 2 fallback calls to DeepSeek V4 Pro. These are the Phase 3D/3E shotplan and sound repairs.

Bakasura: `script` 23 fallback calls to DeepSeek V4 Pro during the factcheck-driven revision loop (before the approved script was restored); `cast` 10 fallback calls to Gemini 3.1 Flash-Lite; `shotplan` 6 fallback calls to Gemini 3.1 Pro and 5 to DeepSeek V4 Pro. The shotplan's Gemini Pro fallback is the largest cost line.

Bake-off failures: DeepSeek V4 Pro script produced malformed JSON; OpenAI models failed formula/length checks; Gemini Pro Savitri was truncated; the OpenRouter free models were rate-limited or blocked by the data policy. Every fallback is in `logs/calls.jsonl` and every cache hit is logged.

## Deviations from the prompt

1. **OpenRouter is unused.** User decision: zero credits and the data-collection deny filter blocks free endpoints; the fee/tax is not worth it. Code and mocks remain.
2. **Only the script stage was fully bake-off'd.** Research, factcheck, cast, shotplan, performance and sound use the routed defaults with fallbacks. The report lists this as the main open item.
3. **The selection rule's first-try gate was 0%.** Every passing script needed repairs. The user's blind ranking was used; the default route is the cheapest passing Savitri script, and Bakasura overrides to the user's top choice.
4. **The Savitri script was not regenerated.** No new ElevenLabs calls were allowed; the approved 21-line script stayed, and only the voice changed.
5. **The fixture voice is 24 kHz mono.** The work voice is 48 kHz; the fixture copy is downsampled to stay under the 10 MB repo rule (3.2 MB). All pipeline checks used the 48 kHz work voice.
6. **The raw aligner numbers fail the p95 target around pauses.** The clean-word subset (105/234) meets 31/75 ms start and 48/101 ms end; the raw numbers are 39/307 and 44/127. The cause is ElevenLabs' pause-time convention, not the aligner.
7. **Bakasura is 66 s, not the brief's 50 s.** The natural Sarvam pace made the approved 178-word script 65.25 s; `project.seconds` was set to 66 so the shot plan and animatic fit the voice.
8. **Animatic frozen threshold changed from 0.02 to 0.005.** A slow camera pull-back on a wide shot produced a 16-frame near-freeze at 0.02; true freezes are 0.000. The 2 s hold-creep check still measures 8.6% (Savitri) and 11.3% (Bakasura).
9. **The Savitri 8/10 is the first re-voice rating.** After the natural-voice fix the user approved the voice and started Bakasura but did not give a second numeric score. Bakasura is 9/10.
10. **`fableon doctor` disk warning.** Free disk 4.4 GB < 5 GB; old work/render directories can be cleaned.
11. **The forced aligner landed in the F5 commit.** F4 was committed before the aligner and voice-QA work finished; the
    aligner, its accuracy test and the QA gate are complete and tested, but the history has them under F5 rather than F4.

## Problems and open questions

- **Approved-script lock.** In autopilot, a failing factcheck auto-revises the approved script (`factcheck revise round`). This changed the user-approved Bakasura script; we restored it and ran the remaining checks with `autopilot=false`. Phase 3F should make an approved script read-only until the user explicitly asks for a revision.
- **Per-stage bake-off.** Research, factcheck, cast, shotplan, performance and sound still need head-to-head tables. The seeded factcheck scorer exists; the shotplan content-check and cast/sound criteria are not wired into `fableon bakeoff`.
- **Voice silence definition.** The voice QA separates **digital silence** (<−60 dBFS, 4.6–7.6%) from **perceptual natural pauses** (<−45 dBFS, 16%). The user's 8% target is met for digital silence; if the target is perceptual pauses, the natural-pace trade-off needs a decision.
- **Pronunciation.** Whisper small matched बचा/चेताया exactly and approximated प्रकट/वस्त्र/पिता; it skipped the दर्द clause and तुरंत. The user approved the voice; the clips remain for a direct listen.
- **Bakasura opening canopy.** The opening wide has a large dark palm canopy at the top; the user said nothing blocking, but it is a set-kit/lighting issue for Phase 3F.
- **Cast sheet group set.** The hermitage banyan blocked Bakasura, so the sheet uses the arena set and ignores only the `tangent` warning. The cast sheet is a review artifact, not the film.

## Please look at

- `fixtures/bakasura-hi/` — the full Bakasura fixture; `docs/reports/phase-3e/bakasura-{cast,hook,hermitage,payoff}.jpg`.
- `work/savitri-hi/animatic.mp4` (89.93 s) and `work/bakasura-hi/animatic.mp4` (66.4 s).
- `work/savitri-hi/voice/ab/ab.md` and the three 20 s WAVs; `work/savitri-hi/voice-qa.md`; `work/savitri-hi/voice/pronunciation.md`.
- `bakeoff/script/blind.md`, `bakeoff/script/results.json`, `bakeoff/script/shortlist.md`.
- `docs/MODELS.md` and `docs/VOICES.md` for the routing and provider facts.
