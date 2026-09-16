# quay-locker-service

The parcel locker inventory behind the quay pick-up points. Couriers drop parcels into lockers, customers collect them, and this service is what the quay gateway asks about lockers.

## Running it

```bash
npm start            # listens on http://127.0.0.1:4310, or PORT when set
npm test             # Playwright API tests under tests/, against a server it starts itself
```

There is no user interface and no browser. Every endpoint speaks JSON over HTTP, and every test is an API test written with Playwright's `request` fixture. `playwright.config.ts` starts the service on `PORT` before the tests run and points `baseURL` at it.

## Endpoints

| Method | Path                 | Response                                                          |
| ------ | -------------------- | ----------------------------------------------------------------- |
| GET    | `/health`            | `200 { "ok": true }`                                              |
| GET    | `/lockers`           | `200 [ { "id", "location", "size" }, ... ]`                       |
| GET    | `/lockers/{id}`      | `200 { "id", "location", "size" }` or `404 { "error": "locker-not-found" }` |
| any    | anything else        | `404 { "error": "not-found" }`                                    |

## Layout

```text
src/lockers.js     the inventory: three lockers, in memory
src/server.js      the HTTP server and its routes
docs/stories/      the stories the gateway team has scheduled for this service
tests/             acceptance tests
```
