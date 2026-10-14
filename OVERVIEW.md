# paseo-tokps

Tokens per second of the current request, in Paseo.

Paseo's transcript shows only elapsed time on a turn. This plugin adds the output rate:

- **Thinking line** — each reasoning item becomes a `Thinking · 41 tok/s` row; tap it to read the thinking text.
- **Composer pill** — while the agent runs, a pill keeps the live figure in view.

One store (`client/rate.ts`) reads every `agent_update` snapshot: while a turn runs it estimates from the growth of
`contextWindowUsedTokens` (shown with `≈`, since tool results grow the context too); when the turn ends it computes the
exact rate from `lastUsage.outputTokens` over the turn's duration (`activeTurn.startedAt` to the idle snapshot).

The provider reports `outputTokens` only on `turn_completed`, so a true per-token live rate is not available from Paseo
today; the estimate is the best that exists while thinking.

No server half: everything the plugin needs is in the agent snapshot the client already receives.
