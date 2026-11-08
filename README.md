# Campus Lost & Found

Sarvam AI-assisted image-based item discovery system for a college or university.

## Included

- Responsive browser UI
- College-email registration and JWT login
- Lost and Found report creation
- JPG/JPEG/PNG upload validation
- Editable manual description and search tags
- Search by text, report type, and category
- Report status transitions
- SQLite prototype database with a schema aligned to the SRS
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

## Deploy to Vercel

Install and authenticate with the Vercel CLI, then run:

```bash
npx vercel login
npx vercel --prod
```

Set `JWT_SECRET`, `COLLEGE_EMAIL_DOMAIN`, and any Sarvam variables in the Vercel project settings. The current SQLite and local-upload prototype uses Vercel's temporary `/tmp` filesystem; use managed PostgreSQL and object storage before production deployment.

The default configuration uses manual-description mode so the application works without an API key. To enable the integration point:

```env
AI_ENABLED=true
SARVAM_API_KEY=your-key
SARVAM_MODEL=gemma4
SARVAM_CHAT_URL=https://api.sarvam.ai/v2/chat/completions
```

The provider adapter is implemented in `src/services/sarvamService.js`. It uses Sarvam's V2 Chat Completions endpoint for `gemma4`, sends the required `api-subscription-key` header and base64 data URI, validates the JSON-like response, enforces a timeout, and fails safely back to manual descriptions. Gemma 4 does not provide native structured-output enforcement, so the application validates the model's prompted JSON response.

## Project structure

```text
docs/                 SRS document
public/               Responsive frontend
src/db/               Database schema and initialization
src/middleware/       Authentication middleware
src/services/         Replaceable Sarvam integration
src/server.js         REST API and server entry point
```

## Prototype limitations

- SQLite is used for easy semester-project setup; the schema can be migrated to PostgreSQL.
- Email verification and password reset are not included yet.
- Semantic embeddings and background AI jobs are planned next.
- Notifications and claims have schema/API foundations but need their full UI workflow.

## Next implementation increments

1. Replace the placeholder Sarvam adapter with the real structured JSON API call.
2. Add integration tests for registration, uploads, AI failures, search, and status transitions.
3. Add claims, notifications, administrator moderation, and statistics.
4. Migrate from SQLite to PostgreSQL/`pgvector` when deployment requirements are finalized.
