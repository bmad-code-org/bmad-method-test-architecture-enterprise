# Epic 7: Offline order capture for field technicians

## Context

Field technicians work in basements, plant rooms and rural sites where the mobile network
is unavailable for hours at a time. Today the order screen requires connectivity, so a
technician either waits for signal or writes the order on paper and re-keys it that evening.
This epic lets the technician capture and edit an order while offline and have it reach the
server when connectivity returns.

The technician client is a native Android application. There is no browser surface and no
web view in this epic, and nothing in it changes how the order screen is rendered.

The deployment is single-tenant: one customer organization per installation, with its own
database and its own application servers. No installation can read another installation's
data, because no storage is shared between them.

Data residency is unchanged and is enforced by the platform's regional routing layer, which
this epic does not modify.

Charging is unchanged: the existing billing service charges the stored card reference on its
own nightly schedule, and this epic does not touch it, call it, or change when it runs.

## Stories

### 7.1 Capture an order while offline

The technician opens an existing work order, adds parts and labour lines, and saves. When the
device has no connectivity the save writes to a local outbound queue instead of the server,
and the order screen shows the order as captured.

The outbound queue is a plain SQLite file in the application's data directory. It holds the
full order payload, including the customer's stored card reference and billing address, and it
is not encrypted at rest. The device's own screen lock is the only thing in front of it.

### 7.2 Edit a queued order before it syncs

A queued order stays editable. Each edit appends a new entry to the outbound queue rather than
replacing the earlier one.

Two technicians can be assigned to the same work order and can both be offline at once. The
server applies queued edits in the order they arrive and performs no version check and no
timestamp check, so a later arrival overwrites an earlier one and the earlier technician's
lines are lost with no record that they existed.

### 7.3 Sync the queue when connectivity returns

The client uploads the queue when the operating system reports a usable network.

A technician working a full day offline accumulates up to 2,000 queued items. The product
requires a full backlog of that size to finish syncing within 30 seconds of regaining
connectivity, on the mid-range devices the field fleet actually carries.

A failed upload is retried immediately and indefinitely until the server accepts it. There is
no backoff, no attempt cap, and no dead-letter path, so a payload the server will never accept
is uploaded again as fast as the network allows for as long as the application is running.

### 7.4 Release

The feature ships enabled for every technician in a single release. There is no feature flag,
no staged rollout, and no way to disable it without shipping a new build through the store
review queue, which takes between one and three days.

## Acceptance criteria

- A technician with no connectivity can save an order and see it listed as captured.
- A captured order remains editable until it has been accepted by the server.
- The queue uploads without the technician taking any action once the network returns.
- An order that reached the server appears on the dispatcher's web console unchanged.

## Out of scope

- Offline capture of anything other than work orders.
- Any change to the dispatcher's web console.
- Any change to how or when a card is charged.
