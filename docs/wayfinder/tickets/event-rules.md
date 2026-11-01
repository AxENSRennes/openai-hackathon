# Define cameo timing and race effects

Type: Grilling (human decision)
Status: Resolved
Assignee: Codex

## Question

When can the cameo appear during a race, how often can it interrupt, and how should its randomized spill and coffee-machine-delay events affect the agents and race duration? Keep the cameo brief, immediately noticeable, harmless, and unable to determine a winner directly.

## Resolution

The host can trigger any number of cameo visits during a race. Visits run one at a time; each new trigger waits until the cameo has left. Any visits still queued when the race ends are discarded and do not carry into the next race. Each visit rolls one outcome: 45% spill, 45% shared coffee-machine delay, or 10% both. A spill removes 10–15 coffee percentage points from one randomly selected eligible agent who is still racing with coffee. A machine delay pauses the shared machine queue for 3 seconds. If a spill is rolled with no eligible agent, skip the spill; a delay rolled alongside it still happens. The 100-second race clock continues and never extends.
