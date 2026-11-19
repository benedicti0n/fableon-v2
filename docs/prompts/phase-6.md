# Phase 6 — Finishing and production

## User decisions
- Production plan: one Hindi vertical short (~90–120 s) every day; later three ~10 min long videos a week. Phase 6 makes the daily short a routine: preset → overnight queue → review gates → final → ready-to-upload package.
- Scope: (1) look & sound controls with partial re-renders, (2) the final-render/export queue, (3) autopilot presets, (4) the publishing package (title, description and hashtags in Hindi + English, a cover image, optional subtitle files), (5) a cost dashboard. No desktop wrapper.
- English interface, the Phase 5 dark studio design system. Both finals were rated 9/10: the finishing tools must rectly when nothing is changed.
- Characters are never lit, glowed, rimmed or mood-graded: every look control acts on world pixels only. project.look.featureRim stays false and is not exposed in the UI.
- Direct providers only (DeepSeek, Gemini, OpenAI, Sarvam; ElevenLabs only when chosen). Nothing routes through OpenRouter.
- No captions burned into the video (house rule). Subtitles are sidecar files only.
- Upload stays manual: the app prepares the package and never calls YouTube or Instagram.

## Ground rules
- npm test green before every commit (golden <= 1.0, Adi audio unchanged); every Phase 4/5 CLI and API behaviour unchanged unless extended here; web unit tests and the e2e green from the commit that touches them.
- Approved outputs stay locked (APPROVED_LOCKED); one writer per project; one heavy job at a time.
- Every paid action and every long local render shows an estimate first. The only exception: a queue item whose batch estimate the user already confirmed against its preset budget (F8).
- Keys live only in the repo-root .env: never printed, logged, cached, exported, sent in prompts, or written to publish files, CSVs or the browser.
- Privacy: the user's email and personal details never go to a model or an external service. The channel profile (F6) goes into the publish prompt only because the user writes it for that purpose.
- CSP unchanged; no external calls from the browser. Server-side external calls only to the configured model/voice providers and the balance endpoints in F10.
- New endpoints → server/openapi.json + docs/API.md + regenerated web types in the same commit. New files get a JSON Schema and validation.
- Justify every new dependency in the commit body; prefer small in-repo code (charts are SVG components).
- Disk: this Mac has ~14 GB free. Every render/export checks free space first (new error DISK_LOW when free < estimated need + 3 GB); `fableon clean` garbage-collects the new caches.

## Features (one commit each, in this order)

### F1  fix(web): phase 5 review fixes
From the Phase 5 screenshots:
- Script: the Hindi line is clipped in a narrow fixed-height box (line 0 ends mid-sentence) while the gloss takes the space. Give LINE >= 40 % of the table width, autosize the editor to its content (Devanagari line-height ~1.7, no inner scroll); the whole line is readable without clicking.
- One content width for every stage screen (Brief, Research and Script differ today).
- Rail and Projects: titles repeat ("Bhima and Bakasura" ×6). Show the project id under the title wherever titles collide; archived projects hidden by default.
- Settings → API keys: show which stages use each key; OPENROUTER_API_KEY shows "not used by current routing". Remove asks for confirmation.
- Split the 540 kB bundle per screen (React.lazy) so the build has no chunk-size warning.

### F2  feat(core): final and publish stages with partial re-renders
- STAGES gains `final` (deps: animatic approved, sound; inputs: board.json, look.json when present (F3), cues.json, audio/mix.wav, the voice, the engine build id; outputs: final.mp4, final-qa.md, the render manifest) and `publish` (deps: final; outputs under publish/). The stepper shows 9 Finish and 10 Publish. `fableon run` still stops at animatic by default; `run --to final|publish` continues. The existing `final` op becomes this stage's runner (CLI name kept).
- Segment cache: each board shot renders to its own cached segment keyed by a hash of exactly what the renderer receives for that shot (the compiled shot description with resolved times, the compiled look, the content hashes of the assets it uses, quality and resolution) plus an engine build id (engine source hash + three.js version + the browser/ANGLE version string). Store as render/final/segments/<shot>.<hash12>.* with render/final/manifest.json. Transitions (crossfades, the flash) are composited at assembly from the segments' handles, so a changed shot never forces its neighbour to re-render. If the current code bakes transitions into frames, refactor it and prove the output unchanged.
- Plan: GET /api/projects/:id/final/plan → {segments: [{shot, scene, frames, cached, reason: new|board|look|voice|engine|quality}], audioOnly, framesToRender, estMinutes, diskNeedMB}. estMinutes uses recent final jobs' seconds per frame (default 0.35 s at 1440×2560 when there is no history). The `estimate` endpoint uses the plan for `final`. When only audio inputs changed, the final is re-muxed with 0 frames rendered.
- After rendering, run short_qa (black/white/frozen/pops, loudness, voice) and the world-only lookcheck → final-qa.md. QA failures fail the stage; look warnings are advisory.
- Keep the previous final as final.prev.mp4 (one version) for A/B; `fableon clean` removes segments not referenced by the current or previous manifest.
- While a final renders, keep the Mac awake: spawn `caffeinate -i -w <job pid>` (macOS only; no-op elsewhere).
- Encode BT.709 colour tags into every new final (x264 VUI: primaries/transfer/matrix bt709, limited range).
- Tests: unchanged inputs → 0 dirty; one shot's look → only that shot; cues only → audioOnly; engine id change → all dirty. Golden unchanged.
- Proof on work/checkpoint-bakasura (the Phase 5 copy; rebuild its audio with the audio op first and show its mix.wav is byte-identical to work/bakasura-hi/audio/mix.wav): render one full final; compare with work/bakasura-hi/final.mp4: same frame count and duration, PSNR >= 45 dB on 20 evenly spaced frames. Then the plan must report 0 frames to render. Record wall times. If PSNR fails, stop and report the differing frames; do not loosen the threshold.

### F3  feat(look): per-scene finishing look (world only)
- Refactor so the per-shot look block comes from one pure function lookFor(shot, sceneMood, adjustments), used by both the board writer and the final compiler. Prove: without look.json, every compiled shot description for both fixtures and the Adi film is byte-identical to before.
- New look.json (schema/look.schema.json), an editable artifact with history:
  { version: 1, scenes: { <sceneId>: { mood?, exposure (-0.5…+0.5 EV), warmth (-1…+1), glow (0…1.5 × the mood's world halation/bloom), haze (0…1.5 ×), shafts (off|soft|strong; only where the set supports a shafts card), vignette (0…1.5 ×) } } }
  Missing values = today's look. A finishing mood override recompiles the look block only. Planning moods stay in shotplan.json (the Phase 5 path). If the board writer derives anything besides the look block from the mood, list it in the report.
- Every adjustment goes through the existing world-only path (charMask): character pixels keep the legacy grade. Test: before/after stills of one shot with every knob at its extreme. The mean |diff| inside the character mask, eroded by 2 px to skip the soft edge, must be <= 0.5/255, while the world region changes measurably.
- stills op: optional `look` draft (unsaved adjustments) and `quality: "preview"` (720×1280) for fast before/after previews; lookcheck runs on the previews and returns its warnings.
- Editing look.json makes only `final` (and `publish`) stale; the approved board stays approved.

### F4  feat(sound): editable music, effects and mix
- cues.schema stays version 1 with additive optional fields: music[].gainDb (-12…+6), music[].muted; stingers[].gainDb, stingers[].muted; sfx[].gainDb, sfx[].seed (integer; picks a different synthesis variation so repeated effects stop sounding identical); top-level mix { musicDb, sfxDb, stingerDb, ambienceDb, duckDb } as dB offsets from today's house levels (0 = today). Absent fields keep today's behaviour: rebuilding the mix of both films and the Adi film gives byte-identical audio.
- `at` keeps the existing anchors: line:word (snaps to a spoken word) or f<frame> (free placement).
- The audio op honours the new fields; mastering stays -14 LUFS integrated, true peak <= -1 dBTP, 48 kHz.
- New light op `sfx-preview` {kind, seed, gainDb} → a 1.5 s WAV in qa/previews/ to audition one effect.
- Editing cues.json through the API sets the sound stage to `edited` (history kept). Re-running the Sound stage would replace the edits, so the UI warns first. Only `final`/`publish` become stale; with audio-only changes the plan is audioOnly.

### F5  feat(web): Finish screen (look, sound, render)
Stepper step 9 "Finish" with three panels:
- Look: one card per scene with its board thumbnail, the planned mood vs the finishing mood, and the six controls.
  - "Preview" (stills op at preview quality, estimate first) shows before/after side by side with a wipe slider, plus the lookcheck warnings.
  - Reset to mood, Copy to scenes…, Save (writes look.json).
  - A permanent note: "Characters are never lit or glowed; these controls change the world only."
- Sound: a timeline built from the Shot plan timeline, with lanes for the voice waveform, music sections per scene (mood, tempo, intensity, instruments, gain, mute), stingers, and SFX markers.
  - SFX: click to add (kind picker), drag to move (snaps to words; hold Alt for frames), Delete removes. An inspector edits kind/gain/seed/note, with "Vary" (new seed) and "Preview".
  - Mix sliders for music, SFX, stingers, ambience and ducking.
  - "Rebuild mix" (audio op) then plays the new mix.wav with its waveform.
  - Keyboard: select a marker; ←/→ moves it one word (Shift: one frame); Delete removes it.
- Render:
  - the plan as a segment strip (cached grey, dirty amber with the reason), plus frames, time and disk;
  - "Render final" (estimate dialog);
  - the final player (Range) with shot markers and an A/B toggle against final.prev.mp4;
  - final-qa with pass/warn badges; Approve final ("picture lock").

### USER CHECKPOINT 1 (after F5)
Report the F2 proof numbers first. Then STOP and ask the user to try Finish on work/checkpoint-bakasura:
- change one scene's look (preview, then save);
- delete or vary a repetitive thud and lower the music a little; rebuild the mix;
- open the plan (only that scene plus audio should be dirty);
- render the final and watch it.

Fix small issues now (fix commits); list bigger ones in the report.

### F6  feat(publish): publishing package
- Channel profile in Settings (<root>/.fableon/channel.json): channel name, standard footer, links, standard hashtags, default category, "made for kids" default (false).
- New model stage `publish`, JSON output validated by schema/publish.schema.json. Routing: primary gemini-3.1-flash-lite (it won the Hindi script bake-off); fallbacks deepseek-flash, then gemini-3.1-pro-preview. Inputs: script lines + gloss, the verified facts and sources, the brief's audience and tone, the channel profile. Output:
  - titles: 5 candidates, each { hi, en, combined }. `combined` is the upload title: Devanagari first, the English names after a separator, <= 100 characters (aim <= 70). The user picks one.
  - description { hi, en }:
    - the first two lines hook (they show above the fold);
    - a short Hindi summary, then an English paragraph;
    - a Source line from the research sources (title, translator, public domain);
    - credits (voice provider and model; music and effects generated by Fableon);
    - the channel footer;
    - <= 5000 characters in total.
  - hashtags: 3–8 (the first three appear above the title): the story and character names in Hindi and English, #shorts for shorts. tags <= 500 characters in total.
  - thumbnailText { hi (<= 4 words), alternatives };
  - pinnedComment (a Hindi question that invites replies).
  - Recommendations the user confirms: madeForKids (with a reason), alteredContent (false for animated stories, with a reason), category.
- Deterministic validator (blocking):
  - the lengths above;
  - no "<" or ">" anywhere (YouTube rejects them);
  - <= 60 hashtags (beyond that YouTube ignores all of them; we use <= 8);
  - no ALL-CAPS words; at most one emoji.
  Then a fact pass on the factcheck routing: every factual claim in the titles and description must be supported by the verified facts. Unsupported claims block until edited, or overridden with a reason (as for the script).
- Cover image:
  - Candidates: ffmpeg frame grabs from final.mp4 (no re-render), one per shot at its steadiest key, never within 0.3 s of a transition or flash.
  - Scoring is deterministic, with the weights documented. Signals:
    - subject head size, from the board validator's measured boxes at the nearest key;
    - face visible;
    - sharpness (Laplacian variance), contrast and saturation;
    - beat (hook/mystery/payoff preferred);
    - 1–2 characters.
  - Keep the top 6.
  - Compose with HTML/CSS in the engine's headless browser, for correct Devanagari shaping; bundle Noto Sans Devanagari Bold/Black.
  - Templates:
    - "clean": the frame only;
    - "title": thumbnailText with a white fill and a thick dark outline (paint-order stroke), one accent word in amber.
  - Text stays out of the Shorts/Reels overlay zones (bottom 25 %, right 15 %) and never covers a head box.
- Output publish/cover.jpg at 1080×1920, <= 2 MB. Keep the templates ratio-agnostic (1280×720 thumbnails arrive with 16:9 projects later).
- Subtitles (sidecar only, never burned in):
  - publish/subtitles.hi.srt from words.json, using the original words (never sayAs respellings);
  - cues follow the script lines, split at word boundaries: <= 2 rows × 42 grapheme clusters (count with Intl.Segmenter), 1–6 s each, >= 2 frames between cues, timed to the final's timeline;
  - optional subtitles.en.srt from the English gloss of each line;
  - parse back and validate (monotonic, inside the duration).
- New op `export` {profiles} → <root>/exports/<YYYY-MM-DD>-<project>/ containing:
  - the video file(s), cover.jpg and the SRTs;
  - publish.md: copy-ready title, description, hashtags, tags, pinned comment, plus the upload checklist (made for kids, altered content, category, language hi, subtitle files);
  - publish.json and export-qa.md.
  Profiles:
  - youtube-short: the final as rendered, re-muxed without re-encoding (+faststart; BT.709 VUI set with the h264_metadata bitstream filter when missing; AAC 48 kHz); <= 180 s.
  - reels: a 1080×1920 lanczos downscale; warn above 180 s.
- Copy with fs.copyFile(…, COPYFILE_FICLONE) so APFS clones rather than duplicates.
- export-qa checks:
  - ffprobe: resolution, 30 fps CFR, duration, 48 kHz audio, colour tags, faststart;
  - ebur128 loudness: -14 ±1 LUFS, true peak <= -1 dBTP.
- "Mark as published" {platform: youtube|instagram, url, publishedAt} → project.json `published` (the URL format is checked locally and never fetched).
- Tests: validator cases, the fact-flag path (mock), SRT segmentation with Devanagari graphemes, candidate scoring determinism, export-qa on a fixture.

### F7  feat(web): Publish screen and projects overview
- Stepper step 10 "Publish":
  - Generate (estimate first).
  - Pick a title: character counters, validator badges, fact flags.
  - Edit the description, hashtags, tags and pinned comment, each with a Copy button.
  - Cover: pick from the 6 candidates and a template; edit the thumbnail text and re-compose (local).
  - A subtitle preview synced to the final player.
  - The upload checklist.
  - Export (profiles); "Show in Finder" (the server runs `open -R` on that export folder only); Mark as published.
- Projects overview: cards show the cover (or a board still), title + id, duration, a 10-dot stage progress, a status badge (In progress / Waiting for you / Rendering / Ready to publish / Published) and spend. Add search, status filters, project tags with "Mark as test", "Hide test projects" (on by default) and bulk archive.
### F8  feat(autopilot): presets and the production queue
- Presets (schema/preset.schema.json):
  - Storage: built-ins in presets/; user presets in <root>/.fableon/presets/.
  - Fields: name; format (short-vertical only; long-16:9 reserved and disabled); seconds; language; the voice block; model overrides; research {web, library files}; sound mix offsets; render quality/workers; gates; budgetUsd per film; publish {enabled, profiles, subtitles hi/en, cover template}.
  - Built-in `daily-short-hi`:
    - voice, pace, fit and models copied from work/savitri-hi/project.json (the 9/10 film);
    - seconds 110;
    - gates [script, animatic, publish];
    - budgetUsd = 2 × the ledger's median complete-film cost, rounded up to $0.50.
- Source library: <root>/library/ (.md/.txt/.html), shared by all projects. A preset or a topic line can attach library files to a new project's research sources.
- New from preset: one topic, or a list with one topic per line (`topic | seconds? | library files?`) → creates the projects (collision-safe ids) and their queue items. One estimate covers the whole batch: a low–high range from the preset's seconds and the ledger's per-stage history. One confirmation pre-approves spend up to each item's preset budget.
- Production queue (<root>/.fableon/queue.json, survives restarts):
  - Items: {id, project, action: autopilot|final|publish|export, to, presetId, status: queued|running|waiting|paused|done|failed|cancelled, estimate, spent, times}.
  - It runs one item at a time through the existing job runner, one stage per job, so each stage is visible and cancellable in Activity.
  - Interactive jobs run first between items; a running item is never pre-empted.
  - Controls: pause after the current item, pause now (cancel, resumable), reorder, retry, remove.
  - New event type `queue` (additive to the event schema).
- Gates: at each gate stage the item waits (status waiting; "Waiting for you" in the UI) until the user approves, then continues automatically. Non-gate stages that pass are approved with by: "autopilot", recorded in state, shown with an "auto" badge and revocable.
- Hard stops, whatever the gates:
  - QA failures: fact-check facts, voice QA, animatic QA, final QA;
  - publish validator or fact flags;
  - DISK_LOW;
  - BUDGET_EXCEEDED (projected or live spend above the item's budget);
  - a provider error after all fallbacks.
  Autopilot never overrides a fact flag and never writes an approved output.
- Overnight: caffeinate while the queue runs. Optional macOS notification (osascript `display notification`) when an item waits, fails or finishes; local only.
- Tests (mock provider and voice): batch create, gates, the auto-approval record, every hard stop, restart persistence, budget pause.

### F9  feat(web): Queue and presets
- Rail: Projects, Queue, Costs, Settings.
- Queue screen: the list (drag to reorder), the current item's progress, total ETA, Start/Pause and per-item actions. Waiting items link straight to the stage to approve.
- "New from preset" dialog: a topic or a list, the library picker, the batch estimate and confirm.
- Presets screen: list, duplicate, edit (a form validated by the schema), delete user presets.

### F10  feat(costs): cost ledger, budgets and dashboard
- Ledger completeness: record every paid call, including stages, fallbacks, retries, auditions, previews, publish and failed calls that bill. Each record has:
  - ts, project, stage/op, job, provider, model;
  - tokens or characters, cached;
  - the unit prices in effect at call time (including DeepSeek off-peak windows if models.json defines them);
  - native currency (Sarvam INR, the others USD), cost, autopilot flag.
  Older rows missing fields are marked estimated.
- Settings → Budgets (<root>/.fableon/budgets.json):
  - a monthly total cap, per-provider caps and a default per-film cap;
  - alert thresholds (50/80/100 %);
  - the INR-per-USD rate (user-set, with its date);
  - per-provider "tax & fees %" (GST, card forex markup) to show the effective cost;
  - display currency (INR by default).
- Alerts: crossing a threshold emits a `budget` event, shows a banner in the shell and (optionally) a macOS notification. At 100 %, paid ops need confirmBudget and the queue pauses paid items.
- Provider balances where an API exists (DeepSeek GET /user/balance, the ElevenLabs subscription endpoint). Sarvam's balance is entered manually with a date. No feature depends on balances.
- Dashboard screen "Costs":
  - a month picker;
  - tiles: spend this month (list and effective), budget left, forecast to month end (run-rate + queued estimates), average cost per film and per finished minute, cache savings;
  - spend per day stacked by provider, and spend by stage;
  - a per-film table: cost by stage and provider, minutes, render machine minutes (from job times), auditions;
  - provider balances;
  - CSV export of the month's ledger (no keys, no prompt text).
- Charts are small accessible SVG components: one fixed colour per provider on every chart, values labelled, and a table view of the same numbers.
- The project header's "$ logged" links to that film's breakdown.
- Tests: aggregates equal the ledger sums; each threshold fires once per month; currency conversion and fees; CSV contents.

### USER CHECKPOINT 2 (after F10) — a real daily short
Ask the user to pick a topic that fits the 8 existing sets. Suggestions: the house of lac escape (lac), Bhima in the Naga realm (naga), Karna at the tournament (arena). Put its public-domain K. M. Ganguli Adi Parva section in library/ (ask the user, or download it from sacred-texts.com with their OK).
Run `daily-short-hi` from the queue. It waits at the script gate, then the animatic gate, then publish. Record per stage: wall time, machine minutes and spend vs estimate; also the export folder contents and export-qa. Fix small issues (fix commits); list the rest.

### F11  test(studio) and docs
- Playwright e2e on a temp root with the mock LLM and voice. Add a test-only render quality if none exists. The journey:
  - Finish: a look edit → the plan shows only that scene dirty → final;
  - publish (mock) → the export folder has a valid SRT and cover;
  - queue: a new-from-preset batch → gate wait → approve → continue;
  - Costs shows the mock usage, and an alert banner when a tiny budget is crossed.
  Assert no secrets in exports, CSV, logs, storage or URLs.
- Screenshots at 1440×900 in docs/reports/phase-6/: Projects overview, Finish (look, sound, render), Publish, Queue, New from preset, Presets, Costs, Settings → Budgets.
- Docs:
  - docs/UI.md (new screens and keys) and docs/API.md;
  - docs/PIPELINE.md (final and publish stages, the segment cache, the queue);
  - docs/PUBLISHING.md (the package and the upload checklist) and docs/COSTS.md;
  - docs/ROADMAP.md: Phase 7 sets & characters; then long-form 16:9; later direct upload and a context-aware SFX library with a licence ledger.
- docs/reports/phase-6.md per the template, including both checkpoints' feedback and fixes.

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0, Adi audio unchanged), plus the web unit tests and the e2e.
2. Identity:
   - no look.json and unedited cues → compiled shots byte-identical, and the rebuilt mix byte-identical;
   - the checkpoint-bakasura full final is >= 45 dB PSNR vs the original, and afterwards 0 frames to render.
3. Partial renders:
   - one scene's look change → only its segments render (report frames rendered/total and time);
   - a sound-only edit → 0 frames, re-mux only;
   - the character-mask diff is <= 0.5/255 with every look control at its extreme.
4. Publishing packages for checkpoint-bakasura and the checkpoint-2 film: the validator and fact pass succeed, the SRTs are valid, the cover is 1080×1920 and <= 2 MB, and export-qa passes.
5. Queue and autopilot: restart persistence, gates and hard stops; checkpoint 2 completed, with spend vs estimate.
6. Costs: dashboard totals equal the ledger sums; each threshold fires once per month; CSV export works; balances shown where available.
7. No secrets anywhere new; CSP unchanged; no external browser calls.
8. `git log --oneline` shows Step 0, then F1–F11 in order (fix commits after each checkpoint).

## Out of scope
- uploading or scheduling to YouTube/Instagram (OAuth);
- burned-in captions;
- 16:9 long-form;
- new sets and characters (Phase 7);
- new SFX kinds or a sample library;
- music generation changes beyond the cue fields;
- a desktop wrapper;
- multiple accounts or key rotation for any provider.
