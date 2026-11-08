# Campus Lost & Found

Sarvam AI-assisted image-based item discovery system for a college or university.

## Included

- Responsive browser UI
- College-email registration and JWT login
- Explicit `/login`, `/`, `/report`, `/mine`, and `/admin` browser routes
- Optional seeded demonstration reports via `DEMO_DATA=true`
- Lost and Found report creation
- JPG/JPEG/PNG upload validation
- Image-first report form: only report type, photo, location, date, and approximate time are required
- Sarvam-assisted editable title, category, colour, description, identifying details, condition, accessories, and tags
- Photo preview, drag-and-drop upload, local draft recovery, low-confidence fallback, bounded retries, and privacy redaction
- Search by text, report type, category, location, and colour
- Item-detail pages with status history and found-item claims
- Notification center with unread state and mark-read actions
- Report status transitions
- SQLite prototype database with backward-compatible schema migrations
- Replaceable `SarvamService` abstraction
- Validated Sarvam response parsing with timeout/error handling
- Automated API, AI-parser, and lifecycle tests
- SRS document: [`docs/Campus-Lost-and-Found-SRS.docx`](docs/Campus-Lost-and-Found-SRS.docx)
- SDLC plan: [`docs/SDLC.md`](docs/SDLC.md)

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open <http://localhost:3000>.

The public landing page is `/`; authentication is handled at `/login`. Protected links redirect to `/login` and return to the requested page after authentication.

## Deploy to Vercel

Install and authenticate with the Vercel CLI, then run:

```bash
npx vercel login
npx vercel --prod
```

Set `JWT_SECRET`, `COLLEGE_EMAIL_DOMAIN`, `ADMIN_EMAILS`, `ADMIN_PASSWORD`, `DEMO_DATA`, and any Sarvam variables in the Vercel project settings. When both admin variables are set, the configured administrator is bootstrapped on each serverless instance. `DEMO_DATA=true` seeds six sample lost/found reports on an empty instance. The current SQLite and local-upload prototype uses Vercel's temporary `/tmp` filesystem; use managed PostgreSQL and object storage before production deployment because ordinary user accounts and uploads are not durable across serverless instances.

The default configuration uses manual-description mode so the application works without an API key. To enable the integration point:

```env
AI_ENABLED=true
SARVAM_API_KEY=your-key
SARVAM_MODEL=gemma4
SARVAM_CHAT_URL=https://api.sarvam.ai/v2/chat/completions
SARVAM_TIMEOUT_MS=15000
SARVAM_MAX_RETRIES=2
SARVAM_RETRY_DELAY_MS=250
SARVAM_MIN_CONFIDENCE=0.35
```

The provider adapter is implemented in `src/services/sarvamService.js`. It uses Sarvam's V2 Chat Completions endpoint for `gemma4`, sends the required `api-subscription-key` header and base64 data URI, validates the JSON-like response, enforces a timeout, and fails safely back to manual descriptions. Gemma 4 does not provide native structured-output enforcement, so the application validates the model's prompted JSON response. Transient failures and timeouts use bounded exponential backoff (`SARVAM_MAX_RETRIES`, default `2`; `SARVAM_RETRY_DELAY_MS`, default `250` ms), while results below `SARVAM_MIN_CONFIDENCE` (default `0.35`) require manual review.

AI-generated and manually edited public text redacts phone numbers, emails, roll/registration/student IDs, and long numeric identifiers. Contact details should be shared through the claim/admin workflow rather than public report descriptions.

## Project structure

```text
docs/                 SRS document
public/               Responsive frontend
src/db/               Database schema and initialization
src/middleware/       Authentication middleware
src/services/         Replaceable Sarvam integration
src/server.js         REST API and server entry point
```

## Current prototype limitations

- SQLite is used for easy semester-project setup; the schema can be migrated to PostgreSQL.
- Vercel filesystem storage is temporary; a durable database and private object storage are required for production.
- Email verification and password reset are not included yet.
- Sarvam Vision OCR is not yet integrated; current privacy protection covers Sarvam text output and user-edited fields.
- Semantic embeddings/vector search and background AI jobs are not implemented yet; matching currently uses lexical/category/colour signals.
- Admin moderation has core review actions but not bulk moderation or full audit-log browsing.

## Next implementation increments

1. Provision durable PostgreSQL/Turso storage and private object storage.
2. Integrate Sarvam Vision OCR with consent-safe redaction and restricted evidence.
3. Add embeddings/vector similarity and background AI processing.
4. Expand admin moderation, observability, rate limiting, and end-to-end coverage.
