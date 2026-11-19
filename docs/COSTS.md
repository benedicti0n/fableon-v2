# Costs and budgets

Every model/voice call appends to a project's `logs/calls.jsonl`. The cost ledger reads those rows, never prompts or
keys, and normalizes them with project, stage, provider, model, tokens or characters, cached, native currency and an
`estimated` flag for older rows without a price. Sarvam's INR cost is converted at the user-set INR/USD rate; provider
tax/fees are applied only to the "effective" figures.

## Budgets

`<root>/.fableon/budgets.json`:

- monthly total USD cap and default per-film cap;
- optional per-provider caps;
- alert thresholds (default 50/80/100), fired once per month;
- INR-per-USD rate and date of the manual Sarvam balance;
- per-provider tax/fees percentages and display currency.

Crossing a threshold broadcasts a `budget` event and shows a banner in the studio. At 100%, paid operations need
`confirmBudget`; the production queue stops paid items.

## Dashboard

**Costs** has a month picker and shows list/effective spend, budget left, forecast (run-rate + queued high estimates),
average cost per film and per finished/logged minute, cached calls/savings, a stacked spend-per-day chart (with a table
view), spend by stage, per-film stage/provider/audition/machine-minute rows, provider balances where an API exists,
and a CSV download. The monthly CSV contains timestamps, project, stage, provider, model, token/character counts,
cached/estimated/autopilot flags and cost — no prompt text and no keys.

Balances: DeepSeek `GET /user/balance` and the ElevenLabs subscription endpoint are read live when keys exist; Sarvam
is manual with the date stored in budgets. No feature depends on a balance.
