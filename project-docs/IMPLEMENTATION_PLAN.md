# MarkDify — Implementation Plan

---

## Phase 0 — Verify Current Repository State

Before changes:

- inspect repository structure
- inspect current frontend routes
- inspect backend runtime split
- inspect R2 and D1 integration
- inspect current admin work
- run current tests/builds
- record findings

---

## Phase 1 — Finalize Data Layer

### Deliverables
- D1 schema for jobs
- D1 schema for audit logs
- optional job events schema
- indexes for KPI queries
- Worker API endpoints
- retention fields

---

## Phase 2 — Finalize Object Storage

### Deliverables
- private R2 bucket configuration
- direct upload authorization flow
- deterministic object key strategy
- signed download flow
- object cleanup utilities

---

## Phase 3 — Split Processing Roles

### Deliverables
- role-aware backend config
- normal role behavior
- OCR role behavior
- internal health/readiness
- internal processing contract

---

## Phase 4 — Deploy Normal Pool

### Deliverables
- N1 on Vercel
- N2 on Vercel
- role-based env config
- R2 connectivity
- D1 connectivity
- normal conversion verification

---

## Phase 5 — Deploy OCR Pool

### Deliverables
- containerized OCR service
- O1 on Render
- O2 on Render
- Tesseract configured
- dimension guards
- OCR verification

---

## Phase 6 — Build Dispatcher

### Deliverables
- upload/start flow
- document vs image routing
- stable selection rule
- peer failover logic
- idempotent job processing

---

## Phase 7 — Build MDAdmin

### Deliverables
- `/mdify-controller`
- two-key access gate
- admin session system
- KPI dashboard
- jobs table
- storage table
- process panel
- delete actions
- ZIP export
- audit view
- cleanup view

---

## Phase 8 — Retention Engine

### Deliverables
- AUTO retention
- KEEP override
- EXTEND override
- DELETE_NOW actions
- scheduled cleanup
- orphan detector

---

## Phase 9 — Testing and Hardening

### Deliverables
- unit tests
- integration tests
- E2E tests
- failover tests
- security tests
- performance tests

---

## Phase 10 — Cutover

### Deliverables
- production config
- monitoring checks
- rollback plan
- docs update
