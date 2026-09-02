# PRD — Case Detail Screen
**Product:** Aegis (Chargeback Sentinel)
**Screen:** Case Detail (single-case investigation view)
**Status:** For implementation
**Owner:** Aryan (product/narrative) — Engineering: ADK engineer, data infra engineer, frontend engineer

---

## 1. Purpose & Scope

Case Detail is where an analyst lands after clicking any action button from the Dispute Worklist (`Prepare Evidence Packet`, `Review Gaps`, or `Escalate to Human`). It shows everything the system knows about a single case — completeness score, evidence packet, gate decision — and is the **only** place in the product where an analyst can move a case toward submission, contest, or acceptance of loss.

This screen contains the product's single highest-risk interaction: the point where a human authorizes evidence to go to a payment network. Every decision in this PRD is written to protect that boundary.

**Out of scope for this PRD:** Dispute Worklist (already fixed), Risk Command Center, Aegis DNA, Audit Logs.

---

## 2. Non-Negotiable Architectural Constraints

1. **No single-click submission, anywhere on this screen, under any button label.** Submission to a payment network requires a minimum two-step flow: an explicit "Prepare Evidence Packet" action that assembles and displays the packet, followed by a **separate confirmation screen** where the analyst reviews exactly what will be sent and clicks a second, distinctly-labeled button to actually submit. These two steps cannot be collapsed into one click, one modal-with-instant-submit, or one button with a "yes/no" browser confirm() dialog. A native confirm() popup is not a confirmation step for this purpose.
2. **The LLM is drafting-only on this screen.** It may generate the dispute response packet text (the actual written rebuttal sent to the network) from the pre-validated, deterministically-scored evidence object. It may **not** decide whether the case is strong enough to contest, may not generate a recommendation ("you should contest this"), and may not alter the completeness score or evidence status in any way.
3. **CONTEST and ACCEPT_LOSS live only here**, not on Worklist. Both require the analyst to have the full evidence packet visible on screen before the action is available (see §3.4/§3.8).
4. **A case with `gate_decision.action = require_manual_review` cannot proceed to packet preparation until a human explicitly overrides the gate** (see §3.5) — and that override itself must be logged, not silent.
5. **No number on this screen without a traceable source.** Every stat (completeness score, evidence sub-scores) must be a value read directly from the backend scorer — nothing computed or estimated in the frontend, nothing labeled with confidence-sounding language unless it maps to an actual stored field.

---

## 3. Page Layout — Top to Bottom

### 3.1 Header
- **Case ID:** `Case #{id}` (H1), e.g. `Case #CB-8829`
- **Subheader line:** `${amount} · Code {reason_code} ({official_name})` — reason code label pulled from the shared `<ReasonCodeLabel>` component built for Worklist — reused here, not reimplemented.
- **Right-aligned buttons:**
  - `Manual Edit` — secondary/outline. Opens an editable view of the evidence packet fields (see §3.6). Does not submit anything.
  - Primary action button — **label and enabled/disabled state driven by case state**, not a static "Approve for Submission":
    - If `worklist_action_available == 'escalate_human'` and no override yet recorded → button reads `Escalation Required` and is **disabled** (grayed out), with a tooltip: "This case requires manual review before evidence can be prepared." A smaller text link below it: `Override and proceed` (see §3.5).
    - If gate has cleared (auto-eligible, or manual override recorded) → button reads `Prepare Evidence Packet`, primary/filled, active. Clicking it does **not** submit anything — it navigates to/opens the confirmation step (§3.7).
    - There is no button on this screen labeled "Approve for Submission" or any variant that implies direct submission.

### 3.2 Completeness Score Panel (left column)
- **Component:** circular progress ring, center shows the score as `{completeness_score}%`.
- Data source: `cases.completeness_score`, read-only display, exactly as computed by the deterministic scorer. No client-side recalculation, ever.
- **Rationale Grounding** text block below the ring: plain-language explanation of the score. **This text is generated server-side by the deterministic scorer/gate module — a templated string built from which evidence items are present/missing — not by the LLM.** E.g.:
  `"Evidence completeness is {score}%. {present_item_1}, {present_item_2}. {missing_item} unavailable."`
  This must be assembled from actual evidence sub-statuses, not freeform LLM text. If engineering wants richer phrasing here later, that's a separate scoped decision — ship the templated version first.

### 3.3 Evidence Retriever Packet (right column, primary content)
- **Header:** `Evidence Retriever Packet ({reason_code})` with a status pill: `Status: Complete` / `Status: Gaps` / `Status: Missing` — pulled from `cases.evidence_status`, same enum used on Worklist.
- **Grid of evidence cards**, one per evidence type required for this reason code (per `reason_codes.evidence_required` array). Each card shows:
  - Icon (static per evidence type, from a fixed icon map — not dynamically generated)
  - Status badge: `Present` (green) or `Missing` (red) — from `evidence_items.status`
  - Evidence type label (e.g. "AVS/CVV Match", "Device IP Match", "Prior Order History", "Customer Comm Log")
  - Retrieved value/summary (e.g. "Confirmed Match", "192.168.1.44 (Known)", "12 Successful Orders", or "Data Unavailable" if missing)
- **This grid is fully data-driven from `reason_codes.evidence_required` joined against `evidence_items` for this case** — it is not a hardcoded 4-box layout. A reason code requiring 6 evidence types must render 6 cards; one requiring 2 renders 2. Engineers must not hardcode a fixed grid size.

### 3.4 Gate Decision Block
- **Header:** `Gate Decision` (renamed from "Aegis Intelligence: Escalation Triggered" — that label falsely implies LLM/AI reasoning; this is deterministic rule output and must be labeled as such).
- Renders the raw `gate_decision` JSON in a monospace code block, exactly as produced by the gate module:
  ```
  gate_decision.rule_triggered = { "rule_id": "...", "condition": "...", "action": "..." }
  ```
- This block only appears if a rule actually fired (`gate_decision.rule_triggered` is non-null). If no rule fired, this section is omitted entirely — do not show an empty or "no issues" version of this block, just don't render it.
- Small icon next to the header should be a neutral rule/gear icon, not an AI/chip icon that implies model reasoning (this was flagged as visually misleading in the prior audit — a chip icon next to a deterministic rule output suggests AI did something clever here; it didn't, a rule matched).

### 3.5 Manual Override Flow (only visible if gate requires manual review)
- Below the Gate Decision block, if `gate_decision.action == 'require_manual_review'` and no override recorded yet: a distinct amber-bordered panel:
  - Text: `"This case was flagged for manual review. Preparing an evidence packet requires an explicit override."`
  - A text input (required): `Override reason` — analyst must type a justification, minimum 10 characters.
  - Button: `Record Override & Unlock Packet Preparation`
  - On click: writes to `case_overrides` table (§4.2) with analyst ID, timestamp, reason, and the original `gate_decision` snapshot. Only after this write succeeds does the primary header button become `Prepare Evidence Packet`.
- This override must be visible later in Audit Logs (out of scope to build here, but the write must happen so that screen can read it).

### 3.6 Manual Edit Mode
- Triggered by the `Manual Edit` header button.
- Opens an inline-editable version of evidence card values (§3.3) — analyst can correct a misretrieved value (e.g. fix a wrong IP match) or annotate a card.
- Any manual edit **does not silently overwrite the original retrieved value** — store both: `evidence_items.original_value` (immutable, what the retriever fetched) and `evidence_items.analyst_override_value` (nullable, what the analyst corrected it to, plus `edited_by` and `edited_at`). The UI shows the override value if present, with a small "edited" indicator and a way to view the original on hover/click.
- Manual edits **do not change `completeness_score`** automatically — score recalculation only happens when the evidence retriever re-runs, not from manual annotation. If this creates a UX gap (analyst fixes something that should raise the score), flag it as a v2 conversation — do not let frontend silently recompute a score client-side.

### 3.7 Two-Step Submission Flow
This is the screen's most important flow — build it exactly as specified.

**Step 1 — Prepare Evidence Packet (triggered from header button)**
- Only reachable if gate is clear or override recorded (§3.5).
- Calls backend endpoint that invokes the LLM drafting step, passing the validated evidence object. LLM returns a drafted response packet (the written rebuttal document).
- Navigates to a **new dedicated route**, `/cases/{id}/review-packet` — not a modal, a full screen, so there's no ambiguity that this is a distinct step.

**Step 2 — Review & Confirm (on `/cases/{id}/review-packet`)**
- Displays the full drafted packet text, editable by the analyst (LLM output is a draft, not final — analyst can revise before sending).
- Displays a clear summary: destination network, case ID, amount, reason code, and every evidence item being included.
- Two buttons at the bottom:
  - `Back to Case` (secondary) — discards nothing, just returns to Case Detail, draft is saved as a work-in-progress.
  - `Confirm & Submit to Network` (primary, distinctly styled — e.g. requires the button to be actively clicked, not reachable by pressing Enter in a text field) — this is the **only** action in the entire product that actually submits to a payment network.
- On submit: backend records `submitted_at`, `submitted_by`, and a snapshot of the final packet text in `case_submissions` table. This is irreversible in the UI — no "unsubmit" button — matching real-world network submission behavior.

### 3.8 CONTEST / ACCEPT_LOSS
- These buttons appear on Case Detail, below the evidence packet, **only after the analyst has viewed the evidence section** (a simple scroll-into-view or tab-visited flag is sufficient — the point is these can't be the first thing clicked on page load).
- `Contest` → routes into the Prepare Evidence Packet flow (§3.7).
- `Accept Loss` → opens a confirmation dialog (native confirm() is acceptable here since this is a single low-complexity binary choice with no drafted content to review) — "Accept loss of ${amount} for this case? This cannot be undone." → on confirm, writes `case_outcomes.decision = 'accepted_loss'`, `decided_by`, `decided_at`.

---

## 4. Backend / Data Requirements

### 4.1 `evidence_items` table

```
evidence_items {
  id                    string (PK)
  case_id               string (FK -> cases.id)
  evidence_type         string            e.g. "avs_cvv_match", "device_ip_match", "comm_log"
  status                enum('present','missing')
  original_value        text              -- immutable, what the retriever fetched
  analyst_override_value text (nullable)
  edited_by             string (nullable, FK -> users.id)
  edited_at             timestamp (nullable)
}
```

### 4.2 `case_overrides` table

```
case_overrides {
  id                 string (PK)
  case_id            string (FK -> cases.id)
  overridden_by       string (FK -> users.id)
  reason              text (required, min 10 chars)
  gate_decision_snapshot jsonb   -- the gate_decision object as it was at override time
  created_at          timestamp
}
```

### 4.3 `case_submissions` table

```
case_submissions {
  id                string (PK)
  case_id           string (FK -> cases.id)
  packet_text        text            -- final, analyst-reviewed version
  drafted_by_llm_at   timestamp
  submitted_by        string (FK -> users.id)
  submitted_at         timestamp
}
```

### 4.4 `case_outcomes` table

```
case_outcomes {
  case_id       string (PK, FK -> cases.id)
  decision      enum('contested','accepted_loss')
  decided_by     string (FK -> users.id)
  decided_at      timestamp
}
```

### 4.5 API endpoints needed

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/cases/{id}` | GET | Full case detail: case row + evidence_items + gate_decision + reason_code join |
| `/api/cases/{id}/override` | POST | Record manual override (§3.5) |
| `/api/cases/{id}/evidence/{evidence_id}` | PATCH | Save analyst manual edit (§3.6) |
| `/api/cases/{id}/prepare-packet` | POST | Triggers LLM drafting step, returns draft packet text, does NOT submit anywhere |
| `/api/cases/{id}/submit` | POST | The one true submission endpoint (§3.7 Step 2) — writes `case_submissions` |
| `/api/cases/{id}/outcome` | POST | Records CONTEST routing or ACCEPT_LOSS decision |

---

## 5. Implementation Notes for Engineers

### 5.1 The submission boundary is the whole point of this screen
If you're unsure whether a button, click handler, or API call counts as "submission" — it doesn't get built until it's explicitly confirmed against §3.7. When in doubt, add a step, don't collapse one.

### 5.2 Reuse, don't rebuild
`<ReasonCodeLabel>` from the Worklist screen gets reused here unchanged. Do not create a second reason-code-rendering component.

### 5.3 LLM call isolation
The `/api/cases/{id}/prepare-packet` endpoint is the only place in this entire screen's backend that touches the Gemini API. It receives the validated evidence object and reason code, returns draft text. It never receives write access to `completeness_score`, `evidence_status`, or `gate_decision` — those are read-only inputs to the prompt, not things the LLM call can mutate.

### 5.4 Testing checklist before this screen ships
- [ ] A case with `gate_decision.action = require_manual_review` cannot reach `/cases/{id}/review-packet` without a `case_overrides` row existing for it first.
- [ ] There is no code path anywhere in this screen that calls `/api/cases/{id}/submit` without the analyst having first landed on `/cases/{id}/review-packet` and clicked the explicit confirm button.
- [ ] Manual edits to evidence values never mutate `completeness_score`.
- [ ] `original_value` is never overwritten — confirm this with a test that edits a value twice and checks the original is still intact.
- [ ] Killing network access to the LLM breaks only the `Prepare Evidence Packet` flow, nothing else on this screen (confirms LLM isolation).
- [ ] Accept Loss and Contest are not visible/clickable before the evidence section has been viewed.

---

## 6. Explicit Non-Goals for This Screen

- No AI-generated recommendation on whether to contest or accept loss — the analyst decides, unaided by any model opinion.
- No auto-submission under any condition, including "high confidence" cases. Confidence score never bypasses the two-step flow.
- No bulk operations — this screen is single-case only.

---

**Sign-off required from:** Aryan (product), ADK engineer (LLM drafting endpoint contract + gate override contract confirmed), data infra engineer (four new tables confirmed) before frontend work begins.
