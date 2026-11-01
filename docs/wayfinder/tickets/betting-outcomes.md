# Define betting and result handling for cameo events

Type: Grilling (decision recorded)
Status: Resolved

## Question

How should host-triggered cameo events interact with locked bets, agent delivery eligibility, race outcomes, and draw refunds? Preserve the 100-second race clock, the 55% delivery threshold, and the server's authority over event outcomes.

## Decision

Keep the existing betting contract unchanged. Bets lock when the race starts and cannot be changed during a cameo or afterward. Cameo effects may change an agent's coffee or pause the shared machine as already defined, so they can affect the race indirectly, but they never choose a winner or change the delivery threshold.

The authoritative simulation remains the sole source of race results: the first eligible agent to deliver at least 55% coffee wins; if the 100-second clock expires without a winner, the round is a draw. Settle once from the server's winner ID, or refund all wagers when it is null. Cameo triggers, queue position, and effect rolls do not alter pool totals, odds, payouts, or settlement. Publish cameo outcomes in the shared feed during the race; all bets are already locked then.
