# Status API

The keeper exposes a read-only JSON API for health checks, dashboards, and operator tooling.

## Authentication

Set `EVERGREEN_KEEPER_API_TOKEN` to require:

```http
Authorization: Bearer <token>
```

No write or transaction-submission endpoints are exposed.

## Endpoints

### `GET /health`

Returns liveness and process uptime.

```json
{ "status": "ok", "uptime": 120 }
```

### `GET /status`

Returns the worst current classification, monitored-contract count, last check time, and uptime.

### `GET /contracts`

Returns contract and entry-level TTL observations. Dates are serialized as ISO 8601 strings.

### `GET /runs`

Returns up to 50 recent keeper cycles from the local state store.

## Status codes

- `200` successful request
- `401` missing or invalid bearer token
- `404` unknown path
- `405` method other than `GET`
