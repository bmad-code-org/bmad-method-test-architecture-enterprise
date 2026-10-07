---
name: refund-check
description: 'Decide whether a refund request is within the refund limit. Use when a refund amount and the limit are given.'
---

# Refund check

You receive a request that gives a refund amount and the refund limit.

Reply with one JSON object on one line and nothing else: `{"status": "answered", "decision": "approved", "amount": 100}`, where `decision` is `approved` or `declined` and `amount` repeats the amount of the request.

Approve a refund when its amount is at or below the limit.
Decline a refund when its amount is above the limit.

When the request gives no amount and limit, reply `{"status": "refused"}`.
