# Epic 9: Show the last successful sync time on the technician home screen

## Context

Technicians ask dispatch whether their device is up to date. The answer already exists on the
device: the sync engine records the completion time of every successful sync. Nothing surfaces
it, so the question is asked over the radio instead.

This epic renders that value on the home screen. It adds one row to a screen that is already
rendered, and it reads a field the sync engine already writes.

## Stories

### 9.1 Render the last successful sync time

The home screen reads the existing `lastSuccessfulSyncAt` field from the local settings store
and renders it as a relative time, for example "synced 4 minutes ago".

The read is a single local key lookup on a store the screen already opens for other fields. No
network call is added, nothing is written, and no new field is stored.

When the field is absent, which is the state of a device that has never completed a sync, the
row is not rendered at all and the rest of the screen is unchanged.

### 9.2 Keep the value current while the screen is open

The row re-renders when the sync engine publishes a completion event, which it already
publishes for the existing progress spinner. No polling and no timer is added.

## Constraints already satisfied

- The value is a timestamp the device wrote about itself. It is shown to the person holding
  the device, so the change exposes nothing to anyone who could not already see it, and it
  adds no personal data to the screen.
- The change writes nothing. The settings store is opened read-only for this field, so no
  order, queue entry or setting can be altered or lost by it.
- The change adds no network call and no storage. The single local key lookup runs on a screen
  that is already open, so the screen's existing render budget is unchanged.
- The row ships behind `home_last_sync_row`, an existing feature flag the release process
  already toggles per organization, so it can be turned off without a new build.

## Acceptance criteria

- A device that has completed a sync shows the relative time of the most recent one.
- A device that has never completed a sync shows the home screen with no sync row.
- The displayed value updates when a sync completes while the screen is open.
- Turning `home_last_sync_row` off restores the previous home screen exactly.
