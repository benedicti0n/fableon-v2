# Publishing a Fableon short

The studio prepares a package; it never uploads. Upload and scheduling to YouTube or Instagram stay manual.

## Generate

Open the film → **Publish** (step 10). The final must be approved. **Generate package** runs the `publish` model stage
(primary Gemini 3.1 Flash Lite, fallbacks DeepSeek Flash and Gemini 3.1 Pro Preview) against the script, gloss, verified
facts, sources, audience/tone and channel profile. The deterministic validator checks:

- five combined titles, Devanagari first, ≤ 100 characters;
- description hi+en ≤ 5000 characters, no `<` or `>`;
- 3–8 hashtags, tags ≤ 500 characters;
- no ALL-CAPS words, at most one emoji;
- thumbnail text ≤ 4 Devanagari words;
- a Hindi pinned question.

A fact pass compares title/description sentences with verified facts and the factchecked script. Unsupported claims
block export; edit the text or record an override reason. Overrides are stored in `publish/override.json` and included
in the package.

## Cover

Six deterministic candidates come from `final.mp4` frame grabs at steady shot moments (never within a transition).
The score weights are: head size 0.30, face visible 0.20, sharpness 0.18, contrast 0.12, saturation 0.10, story beat
0.06 and 1–2 characters 0.04. The HTML/CSS composer uses the bundled Noto Sans Devanagari Black and keeps text out of
the Shorts/Reels bottom 25% and right 15% zones. Output is 1080×1920 JPEG, ≤ 2 MB.

## Subtitles

`publish/subtitles.hi.srt` is generated from `words.json` (the original spelling; `sayAs` is never exported). Cues
follow script lines, split at word boundaries at ≤ 2 rows × 42 grapheme clusters, 1–6 s each, at least 2 frames apart.
An English sidecar is generated from the gloss. Nothing is burned into the video.

## Export

Choose `youtube-short` and/or `reels`:

| profile | video | audio |
|---|---|---|
| youtube-short | final as rendered, re-muxed with faststart and BT.709 VUI | AAC 48 kHz |
| reels | 1080×1920 lanczos downscale | AAC 48 kHz |

The export folder is `<root>/exports/<YYYY-MM-DD>-<project>/` and contains the video(s), `cover.jpg`, the SRTs,
`publish.md`, `publish.json`, and `export-qa.md`. APFS clones are used where possible. `export-qa` checks resolution,
30 fps, duration, 48 kHz audio, colour tags, faststart and EBU R128 (-14 ±1 LUFS, true peak ≤ -1 dBTP). Reels over
180 s warn.

## Upload checklist

- [ ] Paste the chosen title (≤ 100; aim ≤ 70), description, hashtags and tags.
- [ ] Use the first three hashtags above the title.
- [ ] Set made-for-kids and altered-content answers from the package.
- [ ] Choose the category stated in the package.
- [ ] Language Hindi; upload `subtitles.hi.srt` and optionally `subtitles.en.srt`.
- [ ] Upload `cover.jpg` if the platform accepts a custom cover.
- [ ] Publish manually, then record the YouTube/Instagram URL with **Mark as published** (checked locally only).

No secrets, API keys, prompt text or private channel profile details are written to the package or CSV.
