# REST API Contract

Base path: `/api/v1`

## Authentication

### `POST /auth/register`

Request:

```json
{
  "fullName": "Asha Rao",
  "email": "asha@college.edu",
  "password": "minimum-eight-characters"
}
```

Response `201`:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "fullName": "Asha Rao",
    "email": "asha@college.edu",
    "role": "USER"
  }
}
```

### `POST /auth/login`

Request:

```json
{
  "email": "asha@college.edu",
  "password": "minimum-eight-characters"
}
```

Response: same shape as registration.

## Reports

### `GET /reports`

Query parameters:

| Parameter | Meaning |
|---|---|
| `q` | Free-text search |
| `type` | `LOST` or `FOUND` |
| `category` | Exact category filter |
| `status` | Report status |

### `POST /reports`

Requires `multipart/form-data` and a Bearer token.

Fields:

```text
reportType=LOST
title=Blue water bottle
category=water bottle
description=Metallic blue bottle with black cap
colour=blue
locationText=Library entrance
eventDate=2026-11-01
approximateTime=14:30
custodyLocation=
contactPreference=IN_APP
tags=blue,metal,black cap
image=<JPG or PNG>
```

Response `201`:

```json
{
  "id": "uuid",
  "reportType": "LOST",
  "title": "Blue water bottle",
  "category": "water bottle",
  "status": "ACTIVE",
  "aiStatus": "DISABLED",
  "imageUrl": "/uploads/file"
}
```

### `GET /reports/mine`

Requires authentication. Returns reports created by the current user.

### `PATCH /reports/:id/status`

Request:

```json
{
  "status": "RESOLVED"
}
```

The server validates the status transition and verifies ownership or administrator role.

### Automatic matching

When a `LOST` report is created, the server compares its title, category, description, colour, and tags with active `FOUND` reports. Matches above the configured prototype threshold are stored in `matches`, notifications are created for both reporters, and the create response includes:

```json
{
  "potentialMatches": [
    {
      "id": "match-uuid",
      "reportId": "found-report-uuid",
      "title": "Black leather wallet",
      "score": 0.72,
      "reportType": "FOUND"
    }
  ]
}
```

## Error Format

```json
{
  "error": "Human-readable message",
  "details": {}
}
```

The API shall not return passwords, API keys, raw image data, private contact details, or unredacted sensitive OCR output.

