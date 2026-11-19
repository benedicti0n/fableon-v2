# Director craft — shot plan

- Reference: 0–1 hard cuts; continuous camera inside a scene; 6–8 f crossfade on a place/time change; a 4-frame flash after the hook (max 3). Group shots into `scene` (place + time); every boundary gets `transition`: crossfade | flash | cut.
- Keep ~80% of screen time on a creeping push-in (0.15–0.35 %/f; 0.6 %/f on a punch word), never a static hold of 4 f+. Moves are smootherstep glides (18–40 f) or `ease:"burst"` (8–10 f). `drama` rolls 4–5°, `reveal` pulls back, `impact` kicks for 7 f, `foreground` puts a catalog mark near the lens on ~1/3 of keys; `follow` needs a `moves` path.
- DOF 25–40% of screen time: close/medium soft, wides sharp; low heights for full/wide.
- **Light:** set `look.mood` per scene. `warm-side` (default dialogue; side key, warm/violet split), `golden-glow` (wonder; backlight, haze, high glow), `dusk` (endings; low orange sun, purple sky), `night-moon` (cool moon key, warm cards), `noon` (harsh midday only). The code builds the world rig.
- **Characters flat-lit:** the mood key/sky/glow/grade applies to the world only. No rim, glow, bloom or mood grade on characters; eye rings off; never lighten skin to fix readability.
- `fableon lookcheck` measures world pixels; `flat light` / `dark face` are advisory — fix with light, not skin.
- **Foreground:** a catalog mark near the lens on ~1/3 of keys. Never an actor mark or a building/location; a prop covering >10% of a subject is re-picked or dropped (`foreground overlap`).
- One idea per camera key; cut on a line or phrase boundary and keep one continuous action per shot.
- Open the film and every new place on a wide/establishing landmark; name it in `mustShow` (`set.mark`, fx id, set-piece id or actor id) so the board turns it into the first key's `with`.
- Punchlines, curses and reactions go closer (medium with hands, close for a reaction); reveals and new places go wider.
- Keep screen direction with `face`; a cut to the other side flips the look.
- Change size by a step (close < medium < full < wide < establishing) or angle/side by at least 30° between keys; never the same size and angle on the same subject.
- A shot is 1.2–6 s (8 s only with `hold`), average 2.5–4 s; a key lasts at least 0.6 s.
- Show the speaker when the narration quotes them, then cut to the listener. Use `talk` when a mouth should move.
- Use only catalog sets, marks, characters, poses, expressions, props and fx. For an asset gap use its `assets.todo.json` stand-in (noose → `net`) and list it in `standIns`. Hindi anchors use `n:k`; cut on the first/last word of a phrase.
- Cover every script line in order; starts strictly increase. A long line may split into two shots with the same line and different start words. Every `look.who` character in a covered line must appear, or the shot needs a `why`.
- Light stays the same inside a place unless the script narrates a time change (`lightChange: true`). Keep the plan lean: a 100 s film is 25–35 shots; do not invent shots for covered lines.
