# Story 4.2: Reserve a locker

Status: ready-for-dev

## Story

As a courier arriving at the quay,
I want to reserve a locker for the parcel I am carrying,
so that the locker is still free when I reach it and nobody else's parcel is put there in the meantime.

## Context

`quay-locker-service` already answers `GET /lockers` and `GET /lockers/{lockerId}` from the inventory in `src/lockers.js`. Nothing in the service knows about reservations yet: there is no reservation route, no reservation state, and the locker payload carries only `id`, `location` and `size`.

The service has no user interface. Every behavior below is an HTTP endpoint that speaks JSON, and the acceptance tests are API tests that run against the service started by `playwright.config.ts`.

## Acceptance Criteria

1. **AC-1: A free locker can be reserved.** `POST /lockers/{lockerId}/reservations` with a JSON body `{ "parcelId": "<string>", "durationMinutes": <integer> }` on a locker with no active reservation responds `201` with a JSON body carrying `reservationId` (a non-empty string), `lockerId` (the locker reserved), `parcelId` (the parcel given) and `expiresAt` (an ISO-8601 timestamp `durationMinutes` after the request).
2. **AC-2: A reserved locker cannot be reserved again.** `POST /lockers/{lockerId}/reservations` on a locker that already has an active reservation responds `409` with the JSON body `{ "error": "locker-reserved" }`, and the existing reservation is unchanged.
3. **AC-3: The duration is validated.** `POST /lockers/{lockerId}/reservations` responds `422` with the JSON body `{ "error": "invalid-duration" }` when `durationMinutes` is missing, is not an integer, is below 1, or is above 1440. No reservation is created.
4. **AC-4: A reservation can be released.** `DELETE /lockers/{lockerId}/reservations/{reservationId}` responds `204` with no body, and a subsequent `POST /lockers/{lockerId}/reservations` on the same locker responds `201` again.
5. **AC-5: The locker reports whether it is reserved.** `GET /lockers/{lockerId}` carries `"reserved": true` while the locker has an active reservation and `"reserved": false` otherwise, beside the existing `id`, `location` and `size` fields.

## Out of scope

- Expiry of a reservation whose `expiresAt` has passed. A later story sweeps expired reservations; until then a reservation is active until it is released.
- Listing reservations, or reserving several lockers in one request.
- Authentication. The service runs behind the quay gateway, which is the only caller.

## Dev Notes

- The inventory is in memory and resets when the process restarts, so a reservation store can live beside it in `src/`.
- `src/server.js` answers `404 { "error": "not-found" }` for every route it does not know, which is what the reservation routes return until they exist.
- Tests live under `tests/` and run with `npm test`, which starts the service through the `webServer` block of `playwright.config.ts`.
