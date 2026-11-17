# Director craft — shot plan

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
