# Porting notes: flat-card (test only)

This is a minimal second pack used by the test suite. It reuses the shared cast, shot-plan,
board, sound and publish stages and replaces only the picture: solid background cards with a
drifting block per shot. It is not a product style and is hidden from the dropdown.

Mapping:
- `adapter.mjs`: `renderPreview`, `renderShotSegments`, `renderSegments`, `renderStills`,
  `renderLookdev` use ffmpeg drawbox only.
- catalog and board schema: the shared ones.
- prompts: `docs/DIRECTOR_GUIDE.md` and this pack's `craft.md`.
- QA: frozen limit 300 frames so a deliberately limited style is not failed by the shared rule.

Porting tasks: none. It exists to fail loudly if the style boundary ever leaks.
