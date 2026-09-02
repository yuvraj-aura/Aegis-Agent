# PRD — Risk Command Center Screen
**Product:** Aegis (Chargeback Sentinel)
**Screen:** Risk Command Center (landing/overview screen)
**Status:** For implementation
**Owner:** Aryan (product/narrative) — Engineering: ADK engineer, data infra engineer, frontend engineer

---

## 1. Purpose & Scope

Risk Command Center is the first screen most users see — it sits at the top of the nav and functions as the product's landing page. Its job is to show two fundamentally different things, kept clearly separate:

1. **How good is the model, historically** — a static backtest result from the synthetic eval dataset. This never changes unless the eval is re-run and the model/scoring logic changes.
2. **What's happening in the live queue right now** — real numbers computed from actual case data as it exists in the database at request time.

This screen is the first impression of the product's core claim — anti-hallucination by design. Every number on it must be traceable to either the eval script's output file or a live database query. Nothing estimated, nothing "illustrative," nothing that looks like a dashboard metric but isn't backed by a real computation.

**Out of scope for this PRD:** Dispute Worklist, Case Detail, Aegis DNA, Audit Logs.

---

## 2. Non-Negotiable Architectural Constraints

1. **Backtest metrics and live metrics must never appear in the same visual container without a clear divider and distinct labeling.** A user glancing at the screen must be able to tell, without reading fine print, which numbers are "as measured on our test set" versus "as of right now."
2. **No number on this screen without a traceable source**, per Aryan's standing rule. Every stat must map to either: (a) a field in the eval script's output report, or (b) a live SQL aggregation over the `cases` table. If a number can't be sourced this way, it does not go on this screen — full stop, no placeholder values, no "coming soon" fake numbers.
3. **No LLM involvement on this screen whatsoever.** This is a read-only aggregation and reporting surface. No generated summary text, no "insight" box, no natural-language interpretation of the numbers — numbers and static labels only.
4. **Dev/testing tools (e.g. "Simulate Webhook") do not ship in the same view as production metrics.** Gate them behind an environment flag or move them to a separate `/dev` route not reachable from primary nav.

---

## 3. Page Layout — Top to Bottom

### 3.1 Header
- Icon + title: `Risk Command Center`
- Right-aligned: `Server Time: {HH:MM:SS}` indicator (green dot = connected) — this is already correctly implemented as a live server-time display, keep as-is. Fetches from `/api/server-time` (same endpoint built for Dispute Worklist deadline calculations — reuse it).
- Refresh icon button next to server time — manually re-fetches all live-section data (§3.3) without a full page reload. Does **not** re-fetch or re-run the backtest section (§3.2), since that's static until a new eval run.

### 3.2 Section A — Model Backtest Benchmark (static, versioned)

**Rename from "RISK TELEMETRY" to "Backtest Benchmark."**

- **Header:** `Backtest Benchmark`
- **Subheader (required, small muted text):** `Synthetic test set · N={sample_size} · Last evaluated {eval_run_date}` — e.g. `Synthetic test set · N=52 · Last evaluated Aug 14, 2026`. This line is not optional — it is the provenance disclosure that makes this box honest. It must render from real values, not be hardcoded text.
- **Metrics grid**, same four values as current implementation, kept:
  - Precision — `{precision}%`
  - Recall — `{recall}%`
  - False-Positive Rate — `{fp_rate}%`
  - (Avg. Confidence is **removed from this box** — see §3.3, it belongs in the live section)
- **Link/button:** `View Full Eval Report` — opens the eval script's output (a stored report artifact — CSV/JSON/markdown, whatever your eval script already produces) either in a modal or a new route `/eval-report`. This lets anyone skeptical of the headline numbers actually verify them, which is the whole point of "traceable."
- This entire section is read from a single stored record, not recomputed per page load — see §4.1.

### 3.3 Section B — Live Queue Snapshot (real-time, computed from `cases` table)

Visually distinct container from Section A — different background shade or a clear horizontal divider with a label change, so nobody mistakes one for the other.

- **Header:** `Live Queue Snapshot`
- **Subheader:** `As of {server_time}` — updates on refresh (§3.1).
- **Metrics, all computed via live query against the `cases` table (built in the Worklist PRD):**
  - **Open Cases** — `COUNT(*) WHERE status = 'open'`
  - **Avg. Completeness Score** — `AVG(completeness_score) WHERE status = 'open'`, rendered as `{value}%`. This replaces "Avg. Confidence" from the old box — same underlying concept, correctly labeled and correctly sourced from real case data instead of sitting next to static backtest numbers.
  - **Escalated (Manual Review)** — `COUNT(*) WHERE gate_decision.action = 'require_manual_review' AND status = 'open'`
  - **Overdue** — `COUNT(*) WHERE deadline < server_time AND status = 'open'`
- If there are **zero open cases**, this section shows an explicit empty state: `"No cases currently in the queue."` — do not show 0%/0/0 across the board as if that's a meaningful measurement; a queue with no data isn't "0% confidence," it's "no data yet." This distinction matters for the same reason as the rest of this PRD: don't imply a number represents something it doesn't.

### 3.4 Section C — High-Value Failsafes Table

This was flagged in the original audit as one of the two strongest, most architecturally honest elements of the earlier prototype (along with the Aegis DNA config screen) — bring it back here, properly sourced.

- **Header:** `High-Value Failsafes` with an `Export CSV` button (right-aligned)
- **Purpose:** surfaces cases where a deterministic gate rule fired specifically because of high transaction value — the exact "ceiling" pattern shown in the earlier prototype (`gate_decision.rule_triggered` with a value-threshold condition).
- **Table columns:**

| Column | Source | Notes |
|---|---|---|
| Case ID | `cases.id` | clickable → `/cases/{id}` |
| Amount | `cases.amount`, `cases.currency` | currency-formatted |
| Gate Rule | `cases.gate_decision.rule_triggered.rule_id` | rendered as a small pill, e.g. `CEILING` |
| Deadline | `cases.deadline` | same red-if-<24h logic as Worklist |
| Action | link icon | opens `/cases/{id}` in same tab |

- **Filter for this table (server-side):** `WHERE gate_decision.rule_triggered IS NOT NULL AND gate_decision.rule_triggered.condition LIKE '%amount%'` (or a cleaner tag-based filter if the gate module tags rules by category — recommend adding a `rule_category` field to `gate_decision.rule_triggered` for this exact purpose rather than string-matching the condition text).
- **Export CSV** button exports exactly the rows currently displayed in this table (respecting any pagination/filter state), not a separate silent full-database dump.
- **Empty state:** `"No high-value failsafes currently active."`

### 3.5 Dev Tools — Removed From This View

- **"Simulate Webhook" button and "Listening on POST /webhook" text are removed from the primary Risk Command Center route.**
- If this tool is still needed for development/testing, move it to a route only reachable in non-production builds (e.g. gated behind `process.env.NODE_ENV !== 'production'`, or a separate `/dev/webhook-simulator` route not linked from nav at all). This is not a stylistic preference — a "Simulate Webhook" button visible during a hackathon demo or investor screen-share invites the obvious question "wait, is any of this real?" and undermines everything else on this page you just fixed to be honest.

---

## 4. Backend / Data Requirements

### 4.1 `eval_runs` table (new — stores backtest benchmark results)

```
eval_runs {
  id              string (PK)
  sample_size     int              -- N used for this eval run
  precision       decimal
  recall          decimal
  fp_rate         decimal
  run_at          timestamp
  report_url      string           -- path/link to the full stored eval report artifact
  is_current      boolean          -- exactly one row should be true at a time; Section A always reads the current=true row
}
```
This table is written to only by the eval script itself (run manually or on a schedule by the ADK/data infra engineer), never by any UI action. The frontend only ever reads the single `is_current = true` row.

### 4.2 Live queries (no new tables — reads existing `cases` table from Worklist PRD)

All Section B metrics are computed via live aggregation queries against `cases`, scoped to `status = 'open'`. No caching layer needed at current expected volume — if case volume grows large enough that live aggregation is slow, revisit with a materialized view, but don't pre-optimize this now.

### 4.3 `gate_decision.rule_triggered` — recommend adding `rule_category`

For Section C to be robust rather than string-matching condition text, recommend the ADK engineer add a `rule_category` enum field to the gate module's rule definitions (e.g. `value_threshold`, `missing_evidence`, `confidence_floor`). This is a small schema addition that makes the High-Value Failsafes filter (and any future gate-based filtering anywhere else in the product) reliable instead of pattern-matching a human-readable string.

### 4.4 API endpoints needed

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/eval-runs/current` | GET | Returns the current `eval_runs` row for Section A |
| `/api/eval-runs/current/report` | GET | Returns/streams the full eval report artifact for "View Full Eval Report" |
| `/api/cases/live-snapshot` | GET | Returns the four Section B aggregates in one response |
| `/api/cases/high-value-failsafes` | GET | Returns paginated rows for Section C, `rule_category = value_threshold` |
| `/api/server-time` | GET | Reused from Worklist PRD |

---

## 5. Implementation Notes for Engineers

### 5.1 Section A vs Section B must never share a data-fetch path
Keep these as two separate API calls and two separate loading states. If Section B's live query is slow or fails, Section A (static, reliable) should still render correctly, and vice versa. Don't build one combined `/api/dashboard` endpoint that couples their fate together.

### 5.2 The subheader provenance lines are not decorative
`Synthetic test set · N=52 · Last evaluated Aug 14, 2026` and `As of {server_time}` are the mechanism that makes this screen honest. Do not let a future redesign drop these lines to "clean up" the UI — they are the thing that separates this screen from the fabricated version that was audited and rejected earlier.

### 5.3 Zero-state handling
Every metric in Section B must handle the zero-open-cases case explicitly (§3.3) — do not let `AVG(completeness_score)` silently return `null` and render as `NaN%` or `0%` on the frontend. Check for empty result sets before rendering percentages.

### 5.4 Testing checklist before this screen ships
- [ ] Section A renders correctly from the `eval_runs` table with zero live queries involved — confirm by cutting DB access to `cases` and verifying Section A still renders (Section B should show a clear error/loading-failed state, not crash the page).
- [ ] Section B numbers match a manual SQL query run directly against `cases` for the same point in time.
- [ ] With zero open cases, Section B shows the explicit empty state, not 0%/0/0.
- [ ] "Simulate Webhook" does not appear anywhere in a production build.
- [ ] Export CSV on High-Value Failsafes produces a file matching exactly what's on screen, respecting any active filters.
- [ ] `View Full Eval Report` link opens/downloads a real artifact, not a 404 or placeholder.

---

## 6. Explicit Non-Goals for This Screen

- No trend arrows, sparklines, or "vs last hour/day" comparisons unless backed by actual historical snapshots stored over time — none exist yet, so none get built.
- No AI-generated commentary, insight, or recommendation text anywhere on this screen.
- No combined single metric that blends backtest and live data (e.g. no single "system health score" mixing precision from the eval set with live queue confidence) — these stay separate, always.

---

**Sign-off required from:** Aryan (product), ADK engineer (`eval_runs` table + `rule_category` field confirmed), data infra engineer (live query performance on `cases` table confirmed) before frontend work begins.
