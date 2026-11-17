# Director craft — shot plan

- Reference: 0–1 hard cuts; continuous camera inside a scene; 6–8 f crossfade on a place/time change; a 4-frame flash after the hook (max 3). Group shots into `scene` (place + time); every boundary gets `transition`: crossfade | flash | cut.
- Keep ~80% of screen time on a creeping push-in (0.15–0.35 %/f; 0.6 %/f on a punch word), never a static hold of 4 f+. Moves are smootherstep glides (18–40 f) or `ease:"burst"` (peak on frame 1, 8–10 f). `drama` rolls 4–5°, `reveal` pulls back, `impact` kicks for 7 f, `foreground` puts a catalog mark near the lens on ~1/3 of keys; `follow` needs a `moves` path.
- DOF: close 12–14 px, medium 10–12 px at 1080 wide, wides sharp; on 25–40% of screen time. Use low heights by default for full/wide. Light tells time: day → golden → night, crossfade each change.
- One idea per camera key. A shot may hold one idea across two keys, never two unrelated ideas in one key.
- Cut on a line or phrase boundary. Keep a shot on one set and one continuous action; split when the place, time or idea changes.
- Open the film and every new place with a wide or establishing key that shows a landmark of that place. Name that landmark in `mustShow` (`set.mark`, fx id, set-piece id or actor id). Turn `mustShow` into the first key's `with`.
- Punchlines, curses and emotional beats go closer: medium for a speaker with hands, close for a reaction. Reveals and new places go wider.
- Keep screen direction with `face`: a speaker looks at the person/thing they address; a cut to the other side flips the look.
- Consecutive keys must change size by a step (close < medium < full < wide < establishing) or angle/side by at least 30°. Never cut from the same size and angle on the same subject.
- No key longer than ~6 s. A shot should be 1.2–6 s (up to 8 s only with `hold: true`); average 2.5–4 s. A key should last at least 0.6 s.
- Let pauses breathe: a key may start on the pause before a punchline, and a reaction may hold after the line.
- Show the speaker when the narration quotes them, then cut to the listener's reaction. Use `talk` on a beat when a character's mouth should move.
- Use only catalog sets, marks, characters, poses, expressions, props and fx. For an asset gap use its `assets.todo.json` stand-in (for example a noose becomes `net`) and list it in `standIns`.
- Hindi anchors use word-index form `n:k` (line n, 0-based word k). Prefer cuts on the first or last word of a phrase, not mid-word.
- The plan must cover every script line in order; starts must strictly increase. A long line may be split into two shots, both listing the same line and starting at different words, so a 100 s film still reaches 28–32 shots. Every `look.who` character in a covered line must appear in that shot, or the shot needs a short `why`.
- Light stays the same inside a place unless the script narrates a time change; mark that shot `lightChange: true`.
- Keep the plan lean: a 100 s film is about 25–35 shots. Do not invent shots for lines that are already covered.
