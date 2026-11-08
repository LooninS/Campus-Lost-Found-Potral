# Test Plan

## 1. Objectives

- Verify that the implementation satisfies the SRS.
- Detect invalid input, authorization failures, privacy leaks, and lifecycle errors.
- Confirm AI failures do not prevent manual report creation.
- Confirm search returns relevant and safe results.

## 2. Test Levels

| Level | Scope |
|---|---|
| Unit | Validators, status transitions, AI response parsing, redaction, ranking |
| Integration | API routes with database and file handling |
| System | Complete browser journeys |
| Acceptance | Supervisor/user validation against SRS criteria |

## 3. Priority Test Cases

| ID | Scenario | Expected result |
|---|---|---|
| TC-001 | Register with approved college email | Account is created and token issued |
| TC-002 | Register with unapproved email | Request is rejected |
| TC-003 | Login with invalid password | Generic authentication error |
| TC-004 | Upload PNG report | Report is created and image is stored |
| TC-005 | Upload GIF/WebP/BMP | Upload is rejected |
| TC-006 | Upload oversized image | Upload is rejected or safely resized according to policy |
| TC-007 | Submit report without image | Required-image error is returned |
| TC-008 | Sarvam timeout | Draft/manual workflow remains available |
| TC-009 | Sarvam malformed JSON | AI result is not published as trusted content |
| TC-010 | AI disabled | Manual report creation succeeds |
| TC-011 | Search by title/tag | Matching report appears |
| TC-012 | Search with no results | Clear no-results response appears |
| TC-013 | User edits another user's report | Request is rejected |
| TC-014 | Invalid status transition | Request is rejected |
| TC-015 | User views public report | Private contact details are absent |
| TC-016 | Sensitive OCR text detected | Text is redacted or restricted |
| TC-017 | Administrator removes report | Report disappears from public search and audit entry exists |
| TC-018 | Expired report search | Expired report is excluded from active results |
| TC-019 | Mobile layout | Core forms and cards remain usable |
| TC-020 | Keyboard-only navigation | All core controls are reachable and operable |

## 4. Acceptance Criteria

The release candidate must pass all P0 test cases, have no open critical defects, and demonstrate:

- Registration and authentication.
- Lost and Found report creation.
- Image validation.
- Manual fallback for AI failure.
- Search and result cards.
- Valid status transitions.
- Privacy-preserving public responses.
- Administrator moderation.

## 5. Test Data Rules

- Use synthetic names, emails, images, and identifiers.
- Never use real student IDs, phone numbers, or identity documents in test fixtures.
- Mock Sarvam responses for deterministic automated tests.
- Include valid, malformed, incomplete, low-confidence, timeout, and quota-error AI fixtures.

