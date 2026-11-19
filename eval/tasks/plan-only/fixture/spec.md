# Alert relay - draft spec

Status: draft. Nothing is built.

## Goal
Send an alert to the right person when a service reports a failure.

## Decided
- Services post failure events to one HTTP intake endpoint.
- The intake endpoint puts each event on a queue before anything else happens.
- A router reads the queue and picks the on-call person from a schedule.
- A sender delivers the alert by SMS. Email is the fallback when SMS fails.

## Not decided
- How to avoid sending 50 alerts for one outage (grouping or rate limit).
- Where the on-call schedule lives: a file in the repository, or an outside calendar.
- Whether an alert needs an acknowledgement, and what happens when nobody acknowledges.
