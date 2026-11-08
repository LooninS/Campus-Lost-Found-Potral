# Software Development Life Cycle Plan

## Campus Lost & Found: Sarvam AI-Assisted Image-Based Item Discovery System

**SDLC model:** Incremental development with stage gates  
**Project type:** Semester software engineering project  
**Baseline specification:** `docs/Campus-Lost-and-Found-SRS.docx`

## 1. Why This SDLC Model Is Appropriate

The project has a stable core workflow but contains higher-risk features that need early validation:

- Sarvam AI image processing and response parsing
- Image privacy and sensitive-text handling
- Search and semantic matching
- Claims, notifications, and moderation

An incremental model allows the team to deliver a working system in small increments while validating risky requirements early. Each increment passes through requirements, design, implementation, testing, review, and documentation activities.

## 2. SDLC Phases

### Phase 1 — Initiation and Feasibility

**Objectives**

- Confirm the problem, stakeholders, scope, risks, and success criteria.
- Confirm that Sarvam AI access and the selected technology stack are feasible.

**Activities**

- Prepare project charter.
- Identify stakeholders and user classes.
- Define in-scope and out-of-scope features.
- Estimate time, skills, infrastructure, and risks.

**Deliverables**

- Project charter
- Feasibility summary
- Initial risk register
- Initial milestone plan

**Exit gate**

- Supervisor approves the project scope and technology direction.

### Phase 2 — Requirements Analysis

**Objectives**

- Elicit, analyze, prioritize, and baseline requirements.

**Activities**

- Write functional and non-functional requirements.
- Define use cases and acceptance criteria.
- Identify privacy, security, accessibility, and AI-specific requirements.
- Review requirements for ambiguity, conflict, and testability.

**Deliverables**

- Approved SRS
- Use-case descriptions
- Requirements traceability matrix
- Initial test plan

**Exit gate**

- Every P0 requirement has an acceptance criterion.
- The supervisor approves the SRS baseline.

### Phase 3 — System and Database Design

**Objectives**

- Define the architecture, modules, data model, interfaces, and security boundaries.

**Activities**

- Create use-case, class, sequence, activity, and state diagrams.
- Define REST API contracts.
- Design database tables, constraints, indexes, and status transitions.
- Define `ImageDescriptionService` and storage interfaces.
- Define privacy and authorization boundaries.

**Deliverables**

- Architecture diagram
- UML diagrams
- Database schema and migration
- API contract
- Security and privacy design

**Exit gate**

- Design covers all P0 requirements.
- API and database contracts are internally consistent.

### Phase 4 — Incremental Implementation

Implementation shall proceed in vertical increments. Each increment must produce executable software and focused tests.

#### Increment 1 — Foundation

- Repository structure
- Environment configuration
- Database initialization
- Error handling
- Logging conventions
- Basic responsive layout

#### Increment 2 — Authentication

- Registration
- College-domain validation
- Password hashing
- JWT login
- Authorization middleware

#### Increment 3 — Report Management

- Lost and Found report forms
- Draft and Active states
- Ownership checks
- Status history

#### Increment 4 — Image and AI Pipeline

- Image validation
- Resize/compression
- Storage adapter
- Sarvam service interface
- Mock Sarvam implementation
- Structured response validation
- Manual fallback

#### Increment 5 — Search and Matching

- Free-text search
- Filters
- Tags
- Result ranking
- Semantic embeddings, if included in the prototype

#### Increment 6 — Claims and Notifications

- Claim submission
- Administrator review
- Match notifications
- Controlled contact

#### Increment 7 — Administration

- Report moderation
- User management
- Audit logs
- Statistics

**Exit gate for every increment**

- Feature works through the user interface or API.
- Unit tests pass.
- Integration tests for the increment pass.
- Security and privacy checks are completed.
- Documentation and traceability are updated.

### Phase 5 — Verification and Validation

**Objectives**

- Demonstrate that the implementation satisfies the SRS and is fit for the intended users.

**Activities**

- Unit testing
- Integration testing
- System and end-to-end testing
- Accessibility checks
- Responsive UI checks
- Security and authorization checks
- Performance testing of prototype-sized search
- User acceptance testing

**Deliverables**

- Test cases and execution results
- Defect log
- Requirements traceability update
- User acceptance record

**Exit gate**

- No unresolved P0 defects.
- All P0 acceptance criteria pass.
- Known limitations are documented.

### Phase 6 — Deployment

**Objectives**

- Deploy a controlled demonstration environment.

**Activities**

- Configure production environment variables.
- Configure database and persistent image storage.
- Enable HTTPS.
- Configure backups and logging.
- Deploy frontend and backend.
- Perform smoke tests.

**Important hosting constraint**

The current prototype uses SQLite and local file uploads for simple development. Vercel serverless storage is temporary, so production deployment requires managed PostgreSQL and persistent object storage. Vercel may be used for a demonstration frontend/API only after these persistence requirements are addressed.

**Exit gate**

- Deployment smoke tests pass.
- Secrets are configured outside source control.
- Persistent data storage is verified.

### Phase 7 — Maintenance and Evolution

**Objectives**

- Correct defects, improve usability, and support future extensions.

**Activities**

- Monitor errors and AI outcomes without logging sensitive content.
- Review user feedback and matching quality.
- Patch dependencies.
- Update requirements and diagrams when behavior changes.
- Maintain migration scripts and test coverage.

**Deliverables**

- Maintenance log
- Release notes
- Updated SRS or change records
- Regression test results

## 3. Governance and Change Control

Every proposed requirement or design change shall record:

1. Change identifier.
2. Requester and date.
3. Reason and expected benefit.
4. Affected SRS requirements.
5. Affected modules, database tables, APIs, and tests.
6. Impact on schedule and risk.
7. Approval decision.

P0 requirements shall not be removed or weakened without supervisor approval. Changes to privacy, authentication, AI data handling, or report visibility require explicit security review.

## 4. Quality Gates

Before a feature is marked complete:

- Code is reviewed against the SRS.
- Input validation and error paths are implemented.
- Tests cover normal and important edge cases.
- No secrets are committed.
- Sensitive data is not exposed in logs or public responses.
- API and database changes are documented.
- The feature is manually checked in the UI when applicable.

## 5. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---:|---:|---|
| Sarvam API unavailable or rate-limited | Medium | High | Provider interface, mock service, manual fallback, bounded retries |
| AI response is malformed or inaccurate | High | Medium | Schema validation, editable draft, confidence warning, user approval |
| Sensitive text is exposed | Medium | High | Redaction, restricted OCR data, privacy tests, safe logging |
| Image storage is lost in serverless hosting | High | High | Use persistent object storage before production deployment |
| Semantic search is too complex for the schedule | Medium | Medium | Deliver keyword/filter search first; make embeddings P1 |
| Unauthorized report access | Medium | High | Ownership checks, role middleware, authorization tests |
| Scope grows beyond semester capacity | High | High | Prioritize P0 requirements and use formal change control |

## 6. Requirements Traceability Process

Each requirement shall map to:

- One or more design components.
- One or more implementation modules.
- At least one test case or acceptance criterion.

Example:

| Requirement | Design element | Implementation | Verification |
|---|---|---|---|
| FR-017 structured AI output | SarvamService sequence | `src/services/sarvamService.js` | AI response parsing unit test |
| FR-024 search filters | Search API design | `GET /api/v1/reports` | Search integration test |
| NFR-010 responsive UI | Frontend architecture | `public/styles.css` | Mobile browser checklist |
| NFR-005 privacy | Access-control design | `src/middleware/auth.js` and response DTOs | Unauthorized-access test |

## 7. Definition of Done

A feature is done only when:

- The requirement and acceptance criterion are understood.
- Design and affected interfaces are documented.
- Implementation is complete.
- Validation and error handling are present.
- Unit and integration tests pass.
- Security and privacy behavior is verified.
- The feature is demonstrated manually when applicable.
- Documentation and traceability are updated.
- The supervisor or project reviewer accepts the increment.

## 8. Project Review Schedule

| Review | Timing | Evidence |
|---|---|---|
| Scope review | Before implementation | Charter and approved SRS |
| Design review | Before core coding | UML, architecture, schema, API contracts |
| Increment reviews | After each increment | Working feature and test results |
| Mid-project review | After report and AI increments | Demonstrable vertical slice |
| Pre-release review | Before deployment | Test report, defect log, security checklist |
| Final review | Submission | Working system, SRS, diagrams, source, and presentation |

