# PRD — Dispute Worklist Screen
**Product:** Aegis (Chargeback Sentinel)
**Screen:** Dispute Worklist
**Status:** For implementation
**Owner:** Aryan (product/narrative) — Engineering: ADK engineer, data infra engineer, frontend engineer

---

## 1. Purpose & Scope

The Dispute Worklist is the primary working queue for a human analyst. Every case shown here has **already been processed** by the upstream pipeline: classified against the reason code schema, had evidence retrieved deterministically, scored via pure Python arithmetic, and passed through the hard-coded failsafe gate.

**This screen does zero reasoning of its own.** It is a read/filter/sort/route surface over pre-computed data. No LLM call happens on this screen, at load time or on any interaction. If an engineer finds themselves adding a prompt call anywhere in this screen's code path, that is a scope violation — stop and flag it.

**Out of scope for this PRD:** Case Detail screen, Risk Command Center, Aegis DNA config screen, Audit Logs. This document covers the Dispute Worklist screen only.

---

## 2. Non-Negotiable Architectural Constraints

These apply to this screen specifically, restated so engineers don't have to cross-reference other docs:

1. **No LLM calls from this screen.** Not on page load, not on filter/sort, not on hover, not to generate any summary text. If a "smart insight" box existed in a prior prototype (it did — the "Aegis Intelligence Summary" widget), it is **permanently removed**, not hidden behind a flag.
2. **No free-typed reason code labels anywhere in this screen's code.** Every reason code label rendered must be looked up from the canonical `reason_codes` table/file — never hardcoded as a string in a component.
3. **No client-side derivation of what action a case is allowed to take.** The action a row can offer (Prepare Packet / Review Gaps / Escalate to Human) is decided server-side by the gate module and stored on the case record. The frontend renders whatever `worklist_action_available` says — it does not compute this itself from `completeness_score` or `evidence_status` via if/else logic in React. This prevents a frontend bug from ever showing an action the gate didn't actually authorize.
4. **No one-click financial decisions from this screen.** "Contest" and "Accept Loss" are irreversible-in-spirit financial decisions and must never be a button in a list row. They only exist inside Case Detail, after the analyst has opened the case and reviewed evidence.

---

## 3. Page Layout — Top to Bottom

### 3.1 Header
- **Title:** `Dispute Worklist` (H1)
- **Subtitle:** `Prioritized queue requiring analyst adjudication.` (static, muted text, no dynamic data)
- **Right-aligned controls:** `Filter` button, `Sort` button (see §3.2, §3.3)

### 3.2 Filter Control
A button labeled `Filter` that opens a panel (dropdown or side-sheet — frontend engineer's call on mobile vs desktop) containing:

| Filter | Type | Options | Data source |
|---|---|---|---|
| Reason Code | Multi-select checklist | Populated dynamically from `reason_codes` table — display as `{code} · {official_name}` | `GET /api/reason-codes` |
| Evidence Status | Multi-select | `Complete`, `Gaps`, `Missing` | Enum, static |
| Deadline | Single-select | `Today`, `This week`, `Overdue`, `All` | Computed from `cases.deadline` vs server time |
| Confidence Band | Single-select | `High (≥85)`, `Medium (50–84)`, `Low (<50)` | Computed from `cases.completeness_score` |

- Filters are combinable (AND logic across filter groups, OR logic within a group's multi-select).
- Filter state should be reflected in the URL query string (e.g. `?evidence_status=gaps&deadline=today`) so a filtered view is shareable/bookmarkable.
- A "Clear all filters" text link appears inside the panel once any filter is active, and also inline near the table header once filters are applied (see §3.6 empty state).

### 3.3 Sort Control
A button labeled `Sort` with a single-select dropdown:

| Option | Behavior | Default? |
|---|---|---|
| Deadline (soonest first) | `ORDER BY deadline ASC` | **Yes, default on page load** |
| Amount (highest first) | `ORDER BY amount DESC` | No |
| Confidence (lowest first) | `ORDER BY completeness_score ASC` | No |

Sort state also reflected in URL query string (`?sort=amount_desc`).

### 3.4 The Table

No summary/insight box of any kind sits between the header and the table. The table is the first content block below the header row.

**Columns, in exact order:**

| # | Column | Data field | Render rules |
|---|---|---|---|
| 1 | Case ID | `cases.id` | Monospace font, e.g. `CB-9901`. Entire row or this cell is clickable → navigates to `/cases/{id}` (Case Detail screen — out of scope here, just needs a valid route). |
| 2 | Reason Code | `cases.reason_code` joined against `reason_codes` table | Render as `{code} · {official_name}`, e.g. `10.4 · Card-Absent Fraud`. Never render the bare code alone. Never render a label not present in `reason_codes`. |
| 3 | Amount | `cases.amount`, `cases.currency` | Currency-formatted per `cases.currency` (e.g. `$4,250.00`). Do not hardcode `$` — read the currency field. |
| 4 | Deadline | `cases.deadline` | Format as relative-if-today (`Today, 17:00`) else absolute date (`Oct 24`). Render in **red/warning color only if remaining time < 24 hours**, computed client-side by comparing `cases.deadline` against server-issued current time (not client device clock — see §5.3). |
| 5 | Confidence | `cases.completeness_score` | Plain integer 0–100. No adjective label on this column (no "High/Med/Low" text here) — the number is the source of truth; band coloring optional but if used, must match the same thresholds as the Filter control (≥85 / 50–84 / <50). |
| 6 | Evidence Status | `cases.evidence_status` | Pill component. `complete` = green, `gaps` = gray/amber, `missing` = red. This value comes directly from the gate module's output — the frontend does not calculate it from evidence sub-fields. |
| 7 | Action | `cases.worklist_action_available` | See §3.5 — button label and style driven entirely by this enum field. |

**Row density:** compact — this is a working queue an analyst scans repeatedly, not a marketing table. No row should exceed one line height except on mobile wrap.

**Pagination:** server-side pagination, 25 rows per page default, page size selector optional (25/50/100). Do not load the entire worklist into the client at once — assume this table can have thousands of rows in production.

### 3.5 Action Button — Exact Logic

The Action column button is rendered purely from `cases.worklist_action_available`, an enum computed and stored server-side at gate-evaluation time. Frontend mapping:

| `worklist_action_available` value | Button label | Style | On click |
|---|---|---|---|
| `prepare_packet` | `Prepare Evidence Packet` | Primary (filled) | Navigate to `/cases/{id}/prepare-packet` — the two-step evidence packet flow. **This must never be a single click that submits anything.** It opens the preparation screen; actual submission requires a separate confirmation step (out of scope for this PRD, covered under Case Detail / Submission Flow PRD). |
| `review_gaps` | `Review Gaps` | Secondary (outline) | Navigate to `/cases/{id}#evidence` — Case Detail screen scrolled/tabbed to the evidence section. |
| `escalate_human` | `Escalate to Human` | Amber outline, visually distinct from both above | Navigate to `/cases/{id}` — Case Detail screen, no shortcut, full context required before any decision. This state overrides all others: **a case with `escalate_human` must never simultaneously offer `prepare_packet`.** Enforce this as a backend invariant (see §4), not just a frontend rule. |

There is no fourth button state. If `worklist_action_available` is null or unrecognized, render the row with **no action button** and a small warning icon — this is treated as a data integrity bug, not a valid case state, and should be logged client-side to error tracking.

### 3.6 Empty & Edge States

| Condition | Display |
|---|---|
| Zero open cases in the entire worklist | Centered message: "No disputes require action" with a subdued icon. No call-to-action button needed here. |
| Filters applied, zero matching rows | "No cases match these filters" + a "Clear filters" text link that resets filter state and URL params. |
| API/network failure loading the worklist | Standard error state with a "Retry" button — do not silently show a stale or empty table. |
| Loading state | Skeleton rows (5–8 placeholder rows), not a spinner over a blank table — preserves layout stability. |

### 3.7 What Was Removed From The Prior Prototype (explicit, so nobody re-adds it by habit)

- **"Aegis Intelligence Summary" box** — the widget showing LLM-generated text like "42 open disputes. Critical spike detected in Reason Code 10.4... Recommending batch review for Case IDs CB-9901 through CB-9915." **Permanently deleted.** This was an LLM performing autonomous pattern-detection and recommending action across a case batch — outside the LLM's scoped drafting-only role. Do not reintroduce any version of this, even a "toned down" one, without a separate architectural review.
- **CONTEST / ACCEPT_LOSS as row-level action buttons** — removed from this screen. These are outcome decisions and now only exist inside Case Detail after full evidence review.

---

## 4. Backend / Data Requirements

### 4.1 `cases` table — fields this screen reads

```
cases {
  id                       string (PK)              e.g. "CB-9901"
  reason_code              string (FK -> reason_codes.code)
  amount                   decimal
  currency                 string (ISO 4217, e.g. "USD")
  deadline                 timestamp (UTC)
  completeness_score       int (0-100)               -- from deterministic scorer, immutable until evidence re-fetch
  evidence_status          enum('complete','gaps','missing')  -- set by gate module
  gate_decision            jsonb {
                              rule_id: string,
                              condition: string,
                              action: enum('auto_eligible','require_manual_review'),
                              evaluated_at: timestamp
                            }
  worklist_action_available enum('prepare_packet','review_gaps','escalate_human')  -- derived server-side at gate evaluation, stored not computed live
  created_at               timestamp
  updated_at               timestamp
}
```

### 4.2 `reason_codes` table — canonical source, referenced not duplicated

```
reason_codes {
  code            string (PK)      e.g. "10.4"
  network         string           "visa" | "mastercard"
  official_name   string           e.g. "Other Fraud — Card-Absent Environment"
  category        string           e.g. "fraud" | "processing_error" | "consumer_dispute" | "authorization"
  evidence_required jsonb array    list of evidence types needed for this code
}
```
This table is seeded once from the canonical source (Stripe's public dispute reason code documentation) and is **never edited by hand in any UI, including Aegis DNA.** Any screen displaying a reason code label does a lookup against this table — no exceptions.

### 4.3 Server-side invariants to enforce (not just frontend rules)

- `worklist_action_available = 'prepare_packet'` **must never** co-occur with `gate_decision.action = 'require_manual_review'`. If the gate says manual review is required, the stored action must be `escalate_human`, full stop — enforce this at the point where the gate module writes to `cases`, and add a DB-level check constraint if the database supports it.
- `completeness_score` and `evidence_status` are write-once per evidence-fetch cycle — recalculated only when the evidence retriever re-runs, never mutated by any UI interaction on this screen.

### 4.4 API endpoints needed

| Endpoint | Method | Purpose | Query params |
|---|---|---|---|
| `/api/cases` | GET | Fetch paginated, filtered, sorted worklist rows | `page`, `page_size`, `sort`, `reason_code[]`, `evidence_status[]`, `deadline_filter`, `confidence_band` |
| `/api/reason-codes` | GET | Fetch full canonical reason code list for filter dropdown | none, or `network` to scope to visa/mastercard |
| `/api/server-time` | GET | Return authoritative server timestamp for deadline countdown calculations | none — see §5.3 |

`/api/cases` response should include total count for pagination controls, and should never require the frontend to fetch all rows and filter/sort client-side.

---

## 5. Implementation Notes for Engineers

### 5.1 Frontend must not compute business logic
Every "what can this case do next" decision is a lookup on `worklist_action_available`, not a conditional built from `completeness_score` or `evidence_status` in component code. If a designer or PM asks for a new action state, that's a backend/gate module change first, frontend rendering change second — never the reverse.

### 5.2 Reason code rendering
Build a single shared component (e.g. `<ReasonCodeLabel code={reason_code} />`) that does the `reason_codes` lookup and renders `{code} · {official_name}`. Use this component everywhere reason codes appear — Dispute Worklist, Case Detail, Aegis DNA, Audit Logs — so a taxonomy fix in one place propagates everywhere instead of needing four separate edits.

### 5.3 Deadline countdown correctness
Do not use `Date.now()` on the client to compute "time remaining" against `cases.deadline` — client clocks drift and can be manipulated. Fetch server time via `/api/server-time` on page load and compute the offset once, then use that offset for all relative-time rendering on this screen.

### 5.4 Performance
- Server-side pagination is mandatory, not optional — do not ship a version that fetches all cases and paginates in JS.
- Debounce filter panel changes (300ms) before firing the `/api/cases` request if filters are applied live rather than via an "Apply" button.

### 5.5 Testing checklist before this screen ships
- [ ] A case with `gate_decision.action = require_manual_review` always renders `Escalate to Human` and never `Prepare Evidence Packet`, even after a page refresh or filter change.
- [ ] No reason code label anywhere on this screen fails to match an entry in `reason_codes` — write a test that asserts every `cases.reason_code` in test fixtures resolves to a real row.
- [ ] Removing/blocking network access to any LLM/Gemini endpoint does not break this screen at all — confirms zero LLM dependency.
- [ ] Empty state, loading state, and error state all render correctly with mocked API responses.
- [ ] Filter and sort state round-trip correctly through the URL (reload the page with query params set, table reflects them).

---

## 6. Explicit Non-Goals for This Screen

- No dashboard-style metrics (no "42 open disputes" counter widget, no aggregate stats box) — that belongs on Risk Command Center, and even there only as labeled backtest data, not live claims.
- No AI-generated text of any kind, summary or otherwise.
- No bulk actions (e.g. "select multiple cases and batch-escalate") in this version — out of scope until the single-case flow is fully correct and audited.

---

**Sign-off required from:** Aryan (product), ADK engineer (gate module output contract confirmed), data infra engineer (`cases`/`reason_codes` schema confirmed) before frontend work begins.
