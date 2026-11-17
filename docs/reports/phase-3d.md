# Phase 3D report — reference direction, pace and sound; the first complete film

## Summary

DeepSeek V4.1 Flash is now the default for every stage, with an explicit `deepseek-v4-pro` fallback that is only tried after the primary repair loop fails and is logged per call. The Savitri voice was rebuilt locally from the cached take with the reference pause policy and a **1.20** pace (85.34 s, 2.742 words/s) at zero ElevenLabs characters. Scripts now follow the STYLE_BIBLE formula and are checked deterministically; the Bakasura dry run produced a clean 10-line Hindi script from Ganguli’s Vaka-vadha Parva. The director layer has scenes, per-boundary crossfades/flashes/cuts, burst easing, punch/impact/drama/reveal/foreground marks, follow paths and film-level checks; sound has a cue-driven original score and SFX mix. Savitri v2 is a 28-shot, 85.26 s film with 24 crossfades, 2 cuts, 1 flash and a PASS animatic/final QA. The user rated the animatic **8/10**; their Sarvam Nachiket voice request is deferred to Phase 3E (out of scope here).

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `3f36c87` | `docs: phase 3D prompt` | Saved the phase instructions verbatim. |
| F1 | `914ae16` | `chore(models): flash by default` | Flash every stage, explicit pro fallbacks, `fallback:true` logs and tests; factcheck at thinking effort `low` passed a live Savitri probe. |
| F2 | `4b05c2e` | `feat(voice): reference pace (local, free)` | Cached-take pause policy and 1.10/1.15/1.20 pitch-preserving variants; user chose 1.20; voice.wav/words.json/project pace. |
| F3 | `c80935d` | `feat(script): reference script formula` | Reference formula prompt, new beats and deterministic checks; Bakasura dry run; legacy beat mapping. |
| F4 | `aeeaf1f` | `feat(director): reference camera language` | Scenes/transitions, burst easing, direction marks, moves/follow paths and film-level checks. |
| F5 | `e5075c6` | `feat(sound): sound stage for new projects` | Model music/stingers + deterministic board SFX, cue-driven score/SFX mix and stems. |
| F6 | `8b7b62c` | `feat(fixture): Savitri v2, animatic with sound, final render` | Savitri v2 plan/board/sound/animatic, user rating, final 1440×2560 QA and fixtures. |
| F7 | this commit | `docs: report` | This report and the roadmap update. |

## Acceptance checks

### 1. Tests

```text
$ npm test
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS model fallback  10/10 checks
PASS voice pace rebuild  16/16 checks
PASS script formula  20/20 checks
PASS director camera  16/16 checks
PASS sound cues + mix  16/16 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

### 2. Authoring board

```text
$ npx fableon frames --project fixtures/adi-parva-authoring
frames: 24 keys, 0 error(s), 0 warning(s), 17.4 ms/frame coverage
```

### 3. Savitri v2

- Pace: user chose **1.20** after listening to `voice/pace/{1.10,1.15,1.20}.wav`; `voice.wav` is 85.34 s.
- Shot plan: user approved the 28-shot plan. `shotplanErrors` and `directorErrors` return `[]`.
- Board: 28 shots, **0 frame errors, 1 warning** (`S20` Yama lowest feet 48 %, a wide-follow warning only), no `needsHuman`.
- Film stats from `board.review.json`: hold **83.7 %**, DOF **38.9 %**, foreground **26.5 %**, low-height **90.5 %**, punches **7**, impacts/kicks **4**, rolls **3**, cuts **2**, flashes **1**, crossfades **24**, keys **34**.
- Animatic QA: **PASS** — 2558 frames, 85.261 s, `-14.2 LUFS`, peak `-1.2 dBFS`, black 0, unplanned white 0, frozen 0, unexplained pops 0.
- User rating: **8/10**; visual note: “all perfect”. Voice note: “a bit robotic … use the Nachiket voice from Sarvam” — deferred to Phase 3E; no new TTS calls were allowed in 3D.
- Final render: 1440×2560, 2558 frames, 85.259 s, `-14.2 LUFS`, peak `-1.3 dBFS`; QA **PASS** (`final-qa.md`). `work/savitri-hi/final.mp4` is 93 MB and is not committed.

### 4. ElevenLabs and DeepSeek

- ElevenLabs in Phase 3D: **0 live calls, 0 characters**. The pace rebuild used the cached take only.
- DeepSeek: 115 calls (8 cache hits), 1,239,569 prompt tokens, 265,204 completion, 27,945 reasoning; **$0.87531 peak** (the off-peak estimate is $0.43766). 34 fallbacks are listed below.
- Flash is the default for brief/research/script/factcheck/cast/shotplan/sound; every fallback is explicit and logged.

### 5. Commit order

```text
3f36c87 docs: phase 3D prompt
914ae16 chore(models): flash by default
4b05c2e feat(voice): reference pace (local, free)
c80935d feat(script): reference script formula
aeeaf1f feat(director): reference camera language
e5075c6 feat(sound): sound stage for new projects
8b7b62c feat(fixture): Savitri v2, animatic with sound, final render
```

## Measurements

- macOS on Apple M1; WebGL `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`; Node 25.9.0; Python 3.12.16; ffmpeg 8.1.1.
- Preview 540×960: about 0.03 s/frame; the 28-shot animatic is ~35 s of render.
- Final 1440×2560: 2558 frames from 23:32:01 to a 23:36:28 `final.mp4` (≈4 m 27 s, ≈0.10 s/frame), plus audio/assemble/QA.
- Disk: `final.mp4` 93 MB, `audio/mix.wav` 24 MB, fixture `fixtures/savitri-hi` 4.6 MB (no MP4/stems committed).

## Pace

| pace | file | length | words/s |
|---|---|---:|---:|
| 1.10 | `work/savitri-hi/voice/pace/1.10.wav` | 93.12 s | 2.513 |
| 1.15 | `work/savitri-hi/voice/pace/1.15.wav` | 89.07 s | 2.627 |
| 1.20 | `work/savitri-hi/voice/pace/1.20.wav` | 85.34 s | 2.742 |

Base: cached `eleven_v3` take `80699ae43fae…`, 100.16 s, 234 words, 2.336 words/s. The pause policy caps dramatic pauses at 0.35 s (hook punchline, deadpan second line, twist), other pauses at 0.12 s and beat gaps at 0.15 s; tempo is pitch-preserving `atempo`. The user chose 1.20. Future takes send `voice.pace` as provider speed; the script budget reads the paced delivered rate.

## Flash usage and fallbacks

| stage | model | calls live/cached | prompt | completion | reasoning | peak $ |
|---|---|---:|---:|---:|---:|---:|
| brief | deepseek-flash | 1/0 | 212 | 641 | 0 | $0.00083 |
| research | deepseek-flash | 1/0 | 8,951 | 1,886 | 0 | $0.00495 |
| script | deepseek-flash | 42/5 | 322,253 | 87,822 | 0 | $0.12281 |
| script | deepseek-v4-pro (fallback) | 23/0 | 386,383 | 54,144 | 0 | $0.38357 |
| script | deepseek-v4-pro (explicit F1 probe) | 1/0 | 6,473 | 464 | 0 | $0.00973 |
| factcheck | deepseek-flash | 12/2 | 45,468 | 31,667 | 27,945 | $0.04709 |
| shotplan | deepseek-flash | 11/0 | 215,390 | 55,767 | 0 | $0.08706 |
| shotplan | deepseek-v4-pro (fallback) | 8/0 | 223,364 | 30,112 | 0 | $0.20519 |
| sound | deepseek-flash | 5/1 | 16,288 | 1,747 | 0 | $0.00337 |
| sound | deepseek-v4-pro (fallback) | 3/0 | 14,787 | 954 | 0 | $0.01072 |
| **total** | | **115/8** | **1,239,569** | **265,204** | **27,945** | **$0.87531** |

Fallbacks (all after the primary exhausted its repairs; `fallback:true` in `calls.jsonl`):

```text
12:37:05, 12:37:39, 12:38:15, 12:39:22, 12:39:45, 12:40:03, 12:43:39,
12:44:03, 12:44:23, 12:44:52, 12:47:17, 12:47:38, 12:48:03, 12:48:23,
12:52:28, 12:54:26, 12:54:45, 12:55:06, 12:55:25, 12:56:29, 12:56:45,
12:57:01, 12:57:17  script flash -> pro
13:43:16, 13:43:55, 13:44:35, 13:48:13, 13:49:02, 13:49:17, 13:49:33,
13:50:23  shotplan flash -> pro
14:11:57, 14:12:01, 14:12:05  sound flash -> pro
```

## Bakasura dry run (script formula)

Project: `work/bakasura-hi`, 50 s, Hindi, source = Ganguli, *Adi Parva*, Vaka-vadha Parva, sections CLIX–CLXVI. Public domain. Source file `research/sources/vaka-vadha-ganguli.txt` records `https://www.swaveda.com/texts/mahabharata/1159/` … `1166/`; the same text is at `https://www.sacred-texts.com/hin/m01/m01160.htm` and following pages.

```text
0. [hook] बकासुर का टैक्स: एक गाड़ी भात, दो भैंसे, एक इंसान। खाने ने उसे खा लिया।
   Bakasura's tax: a cart of rice, two buffaloes, one human. The meal ate him.
1. [setting] एकचक्रा में हर परिवार की बारी आती थी। एक बैलगाड़ी भात, दो भैंसे और एक इंसान बकासुर तक जाता था।
   In Ekachakra every family took its turn. One cart of rice, two buffaloes and one human went to Bakasura.
2. [escalation] इस महीने बारी ब्राह्मण की थी। उसके पास नौकर खरीदने के पैसे नहीं थे।
   This month it was the brahmin's turn. He had no money to buy a substitute.
3. [escalation] ब्राह्मण ने कहा, "मेरी बारी है, पैसे नहीं हैं।" कुंती ने भीम को आगे किया। भीम बोला, "ठीक है, मैं जाऊंगा।"
   The brahmin said, "It is my turn, I have no money." Kunti sent Bhima forward. Bhima said, "Fine, I will go."
4. [escalation] भीम की भूख असली वजह थी। वह बैलगाड़ी का भात खुद खाने बैठ गया।
   Bhima's hunger was the real reason. He sat down to eat the cart's rice himself.
5. [mystery] बकासुर वहां पहुंचा तो अपना खाना किसी और को खाते देख क्या बोला?
   When Bakasura arrived and saw someone else eating his food, what did he say?
6. [pivot] दरअसल, भीम ने उसे अनदेखा किया। पीठ पर भारी प्रहार पड़ा, फिर भी वह खाता रहा।
   Actually, Bhima ignored him. A heavy blow landed on his back, yet he kept eating.
7. [analogy] यह ऐसा था जैसे कोई कुत्ता आपकी थाली में मुंह डाले। आप खाना खत्म करके उठते हैं।
   It was like a dog putting its mouth in your plate. You finish the food and then stand up.
8. [payoff] फिर उसने पेड़ उखाड़े और बकासुर को घुटने पर मोड़ दिया। सुबह गांव वालों ने उसे गेट पर देखा।
   Then he uprooted trees and bent Bakasura over his knee. In the morning the villagers saw him at the gate.
9. [payoff] भीम चुपचाप चला गया। अब इंसान का भेजा जाना बंद हो गया, बस त्योहार मनाया जाता है।
   Bhima slipped away quietly. Now the sending of humans stopped, only a festival is celebrated.
```

Checks: 10 lines / 166 words, all deterministic formula checks pass (`hookAdvisory.paradoxAsFact=true`; hook 14 words; 1 setting; 3 escalation with quoted dialogue; 1 mystery ending `?`; pivot `दरअसल,`; 1 analogy; 2 payoff; median sentence band; literal looks). Fact-check (Flash, thinking `low`): every factual verdict `ok`; craft advisory **weak** at line 7 (the dog-at-plate analogy is muddled) and line 9 (the closing consequence). No voice was generated (quota). This script is the evidence that the formula works; the Savitri film keeps its older script because a new script would require a new voice take and no ElevenLabs calls were allowed.

## Savitri v2 direction

- 28 shots, 6 scenes: `palace-day`, `hermitage-day`, `village-day`, `deer-golden`, `village-golden`, `deer-night` (day → golden when Yama appears → night after the turn).
- 24 crossfades (6–8 f), **2 hard cuts** (S17, S26), **1 four-frame flash** after the hook (S5).
- 7 punch-ins (hook, Yama reveal, fourth boon, concession, twist, plus two framing punches), 4 impacts/kicks, 3 rolls, 3 reveals, foreground on 26.5 % of keys.
- `S20` was the 3C “follow with nobody walking” problem. It is now a village-golden follow with a Yama path from `village.front` to `village.palms`; no canopy blocker. The one remaining board warning is Yama’s lowest feet at 48 % in that wide—deliberate leaping/walking framing, not a QA error.
- `hold 83.7 %`, `DOF 38.9 %`, `foreground 26.5 %`, `low-height 90.5 %`; all within the Phase 3D limits. DOF per size: close 13, medium 11, wide/establishing 0.

## Cue sheet and mix

Six music sections (palace-day wonder 72 bpm; hermitage-day calm 66; village-day warm 84; deer-golden tense 96; village-golden dark 88; deer-night dark 76), instruments drawn from tanpura/sitar/flute/tabla/musicbox/pad. Stingers at the hook (0:0), the explain/mystery anchor (14:0) and the payoff (20:0). Nine SFX: flash hit, shimmer, three thuds, steps, whoosh, pop and the final impact. `cues.md` is committed.

Mix: voice unchanged, music ducked 4 dB under speech and sitting 9 LU under voice, SFX −6 dB; **−14.2 LUFS**, true peak **−1.3 dBTP**, exactly 86.543 s. The final film QA is **−14.2 LUFS**, peak **−1.3 dBFS**.

## Problems, deviations and open questions

1. **Shot plan provenance.** The fresh flash plan repeatedly missed the film-level shares and had invalid anchors. After honest repair attempts, F6 used the approved 3C 28-shot plan as the base and applied the Phase 3D direction deterministically (scenes, transitions, marks, low heights, size mix, S20 moves). The user reviewed and approved the resulting `shotplan.md`. This is disclosed because it is not a pure model-written plan; the deterministic board writer and checks are the guard.
2. **Savitri script formula.** The film keeps the older 21-line script because the cached 1.20 voice belongs to it; regenerating the script would require a new ElevenLabs take, and 3D forbids new calls. The Bakasura dry run is the formula evidence.
3. **Sarvam Nachiket.** The user asked for the Sarvam voice after rating the animatic 8/10. Sarvam is explicitly out of scope for 3D and no provider key/credit was used; the request is recorded for Phase 3E. The film keeps the 1.20 Callum take.
4. **QA frame offsets.** `assemble` starts the video at storyboard frame 2, so QA metadata is shifted to video-relative frames; the final pop check allows ±3 frames for concat/encode (one camera jump at 512, nearest planned 511). The animatic check still uses ±1. This is stated rather than hidden.
5. **Frozen spans.** Early animatic runs showed static full/wide keys; adding short push keys/punches on S2/S13/S25/S29 removed every frozen span. The final animatic and final QA both report 0 frozen spans.
6. **Skill contradiction.** `references/reports/motion.md` says the reference glides are symmetric and that “ease-out bursts” were a measurement error; the Phase 3D prompt explicitly asks for burst easing. The implementation follows the phase prompt and documents the contradiction here.
7. Open: line 7 analogy and line 9 payoff in the Bakasura dry run are craft-weak (advisory); Sarvam remains the first 3E voice target; 805 ElevenLabs characters remain.

## Please look at

- `work/savitri-hi/final.mp4` — the first complete AI-made Savitri film at 1440×2560.
- `work/savitri-hi/animatic.mp4` — the rated 8/10 animatic with mix.
- `fixtures/savitri-hi/shotplan.md`, `board.json`, `board.review.json`, `frames.json`, `cues.json`, `cues.md`, `animatic-qa.md`, `final-qa.md`.
- `docs/reports/phase-3d/final-sheet_*.jpg` — contact sheets from the final render.
- `work/bakasura-hi/script.json` / `script.review.json` — the dry-run formula evidence.
