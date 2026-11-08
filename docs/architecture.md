# System Architecture and Module Design

## Architecture Style

The prototype uses a modular monolith with a responsive web client and REST API. This is appropriate for a semester project because it keeps deployment and debugging simple while preserving service boundaries for future extraction.

```text
Browser
  |
  | HTTPS / JSON / multipart upload
  v
Express REST API
  |
  +-- Authentication and authorization
  +-- Report management and lifecycle
  +-- Image validation and storage
  +-- Sarvam AI adapter
  +-- Search and matching
  +-- Claims and notifications
  +-- Administration and audit
  |
  +-- Relational database
  +-- Image/object storage
```

## Module Responsibilities

| Module | Responsibility |
|---|---|
| Authentication | Registration, login, password hashing, JWT, roles |
| Report management | Report CRUD, validation, ownership, lifecycle |
| Image processing | MIME/size/dimension checks, resizing, thumbnails, metadata stripping |
| AI integration | Sarvam request construction, retries, timeout, response parsing, confidence |
| OCR/privacy | Text extraction, sensitive-data detection, redaction and access control |
| Search | Free text, filters, tags, full-text search, semantic ranking |
| Matching | Lost/found compatibility, similarity threshold, match records |
| Notifications | In-app notifications and delivery status |
| Claims | Claim submission, review, controlled contact, resolution |
| Administration | Moderation, user management, statistics, audit logs |

## Key Design Decisions

1. AI is behind an `ImageDescriptionService` interface so tests can use a deterministic fake.
2. Image storage is behind a storage interface so local files can later be replaced by object storage.
3. Reports are created as drafts or safe manual submissions when AI fails.
4. Public response objects exclude private contact details and raw OCR data.
5. Search and matching are delivered incrementally: keyword/filter search first, embeddings second.
6. Item description uses Sarvam Token Factory `gemma4` through `POST /v2/chat/completions`; document OCR is a separate future integration using Sarvam Document AI / Sarvam Vision.

## Deployment Boundary

The local prototype uses Node.js, SQLite, and local uploads. A persistent deployment requires PostgreSQL and object storage. Serverless temporary files must not be treated as durable application data.

