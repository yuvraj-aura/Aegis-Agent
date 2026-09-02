# Aegis — Frontend PRD
**Companion to:** chargeback-sentinel-PRD.md (backend/architecture)
**Design system source:** DESIGN.md (Sentinel Intelligence tokens) — use as-is, no changes needed
**Status:** Ready for engineering handoff

---

## 0. Naming decision (resolve before anyone opens Antigravity)

The product is **Aegis** everywhere, full stop. The backend PRD, the buildspec, and the earlier strategy brief all say "Chargeback Sentinel" — that name is now retired. Every screen, every component, every doc reference goes to Aegis. The DESIGN.md component spec still says "Sentinel-generated insights" for the evidence cards — rename that line to "Aegis-generated insights" when you copy the token file into the repo. This isn't cosmetic: a three-way naming conflict across your own submission materials is the kind of inconsistency a judge notices in the first ninety seconds.

---

## 1. Why the frontend matters for this specific track

The track's own bar is "every money action explainable, bounded and gated. Show the audit trail and one failure handled gracefully." That is a frontend requirement as much as a backend one — the UI's entire job is to make the deterministic gate *visible*, not to look like a generic SaaS dashboard. Every screen below exists to expose one specific part of the pipeline (Section 5 of the backend PRD) to a judge's eyes. If a screen doesn't map to a real pipeline step or a real schema field, it doesn't belong in this build.

**The one rule that overrides every screen spec below:** if a number, label, or statistic appears on screen and you can't point to the exact backend field or eval-script output it came from, it doesn't go on screen. Placeholder data is fine during development; it is not fine in the version you record the demo with.

---

## 2. Design system — use DESIGN.md as-is

The token file (Sentinel Intelligence palette, Inter + JetBrains Mono, 4px radius, tonal-layer elevation) is genuinely well-suited to this product's "forensic tool" positioning — restrained, data-dense, calm under pressure. No changes needed to colors, type scale, spacing, or component shapes. Two small corrections to carry over when engineers implement it:
- Rename any "Sentinel" references in component descriptions to "Aegis" (Section 0).
- The **Confidence Gauge** component (circular indicator, `headline-sm` numeral) renders the completeness score directly — see Section 6.3 of the backend PRD, there is no separate "win rate" input feeding it anymore.

---

## 3. Information architecture

Four sections, not five. The Stitch mockups included an "Intelligence" nav item with no defined purpose behind it — cut it. Undefined nav items invite a judge to click into something empty mid-demo.

1. **Risk Command Center** (dashboard/home)
2. **Dispute Worklist** → **Case Detail** (drill-down)
3. **Audit Logs**
4. **Aegis DNA** (configuration)

---

## 4. Screen-by-screen specification

### 4.1 Risk Command Center (Dashboard)

**Purpose:** the first thing a judge sees. Prove the pipeline runs and prove it's honest about what it doesn't know.

**Real, computable metrics only:**

| Card | Source | Replaces (Stitch version) |
|---|---|---|
| Total Packets Processed | count of rows in audit log | "Total Active Disputes" (kept, relabeled) |
| Action Distribution (CONTEST / ACCEPT_LOSS / ESCALATE) | `action` field, grouped, audit log | — new, not in mockups |
| Escalation Rate | `% of packets where gate_decision.passed = false` | — new |
| Avg. Confidence Score | mean of `confidence` across packets | — new |
| **Precision / Recall / False-Positive Rate** | direct output of the eval script (backend PRD §12) | — this should be the most prominent card on the page, not buried; it's literally what the track scores |

**Cut entirely — cannot be computed, do not attempt:**
- "Net Recovery Value" — requires knowing real-world dispute outcomes; the agent never submits anything, so this number cannot exist. Do not approximate it either.
- "Win Rate: 78.2%" — same problem, same fix: cut.

**Keep and build as designed — this was the strongest part of the mockups:**
- **Confidence Distribution** chart (High >85% / Medium 50–84% / Low <50%), bucketed directly from the `confidence` field across all packets. Real, honest, and visually does the job of "show the engine thinking."
- **High-Value Failsafes** table — this is the single best screen concept in the mockup set. Case ID, amount, `gate_decision.rule_triggered` (rendered as the CEILING / HISTORY / SIGNAL-style badges from the mockup — these map directly to the four gate rules in backend PRD §6.4), deadline. Build this exactly as designed, just wire it to the real field.

### 4.2 Dispute Worklist

**Purpose:** the operational view — every packet, sortable, scannable.

**Columns, mapped to schema:**

| Column | Schema field |
|---|---|
| Case ID | `chargeback_id` |
| Reason Code | matched schema entry (backend PRD §7.1.1) — **verify against the actual 5-code table before wiring**, the Stitch mockup had 4837 and 13.1 swapped |
| Amount | input event `amount` |
| Deadline | input event `dispute_deadline` |
| Confidence | `confidence` |
| Evidence Status | derived from `evidence_used` — show "Complete" if all required fields `present`, "Gaps" if any `missing`, badge color per DESIGN.md status tokens |
| Action | `action` (CONTEST / ACCEPT_LOSS / ESCALATE_TO_HUMAN) |

**Do not build:** any "Auto-Submit" or "Auto-[anything involving network action]" button in the toolbar. Export (packet data to CSV/PDF) is fine — it's a read operation. Anything that implies the worklist can act on a network is out of scope per backend PRD §3.

### 4.3 Case Detail (the screen judges will actually click into — get this exactly right)

This is the screen from the mockups with the fabricated 92% win rate and the wrong evidence set. Full correction:

**Case Summary card:** `chargeback_id`, `amount`, matched reason code — unchanged from mockup, this part was fine.

**Confidence display:** large numeral = `confidence` (the completeness score, nothing else). The rationale text underneath must be generated *only* from fields actually present in that case's `evidence_object` — this is Layer 1 of the anti-hallucination requirements (backend PRD §8). Correct example for a 10.4 (Unauthorized Transaction) case: *"Evidence completeness is 75%. AVS/CVV match confirmed, device fingerprint matches known customer device. Customer communication log unavailable — see Evidence Packet."* Notice what's absent: no invented win-rate percentage, no claim about a field not in the object.

**Evidence Retriever Packet:** this must show the fields **specific to that case's actual reason code**, pulled from backend PRD §7.1.2 — not a generic "Order Details / Proof of Delivery" set applied to every case regardless of type. A 10.4 (fraud) case shows `avs_cvv_match`, `device_ip_match`, `prior_order_history`, `customer_comm_log`. A 13.1 (not received) case shows `delivery_tracking`, `carrier_delivery_confirmation`, `customer_comm_log`. Each row's status badge is literally the `status` value from that evidence object entry: `present` / `missing` / `unverifiable`. If a field is `missing`, show it — don't hide the row. A visibly incomplete packet is the product working correctly, not a bug to disguise.

**Action buttons:**
- Replace **"Approve & Send to Network"** with **"Approve for Submission"** or **"Mark Ready — Human Submits."** The distinction matters legally and architecturally: this button records a human decision in the audit log, it does not touch any network, real or simulated. Label it so nobody watching the demo could mistake this for a live integration.
- "Manual Edit" — fine to keep, represents the human-override path, which strengthens your "bounded, human-in-the-loop" story.

**If the case's action is `ESCALATE_TO_HUMAN`:** the screen should visually foreground *why* — the `gate_decision.rule_triggered` value, in plain language, above the fold. This is your best demo moment (backend PRD §5, the failure-injection cases) — don't bury it under the same layout used for a clean CONTEST case.

### 4.4 Audit Logs

**System Audit Log table:** built as designed in the mockup — timestamp, case ID, event type, detail, actor — this maps directly to the PostgreSQL audit log schema (backend PRD §11) and needs no changes.

**Cut "Post-Mortem Analysis"** (Aegis recommendation vs. actual outcome) — same problem as the dashboard's win rate: no outcome data exists or ever will in this build. Replace with an **Eval Snapshot** card: precision, recall, false-positive rate, and reproducibility check status, pulled straight from the last eval script run (backend PRD §12). This is real, it's the number that actually gets you scored, and it belongs somewhere a judge will find it without you having to point it out.

**Compliance Export:** keep as designed — exporting the full `DisputeResponsePacket` set to PDF/CSV is a straightforward read operation and reinforces the audit-first positioning. Treat as lower priority than the other screens if time is tight.

### 4.5 Aegis DNA (Configuration)

Second-best screen concept in the mockups — this is backend PRD §7.1/§15 made visual, which is exactly the right instinct.

**Global Failsafe Rules panel:** Escalation Value Threshold and Minimum Confidence Score inputs — bind these to the actual configured values (auto-handling ceiling, and **75%**, not the 65% shown in the mockup — pick one number and make sure the UI default matches whatever the gate module actually enforces, per backend PRD §7.1.3). If these are meant to be editable in the demo, changing them here should visibly change gate behavior on the next packet processed — that's a strong "look, it's not hardcoded theater" moment if you have time to wire it live.

**Reason Code Mappings table:** show your actual **5** configured codes (backend PRD §7.1.1) with their category and auto-assemble toggle. Do not display a fabricated total like "142 Codes" — show "5 Active Configurations." A smaller, fully-real number reads as more credible than a large fake one, not less.

**Cut "Win-Rate Impact" widget** ("+1.8%") entirely — there is no win-rate data anywhere in this system by design (backend PRD §7.1.4), so a widget projecting the impact of fixing something on a metric that doesn't exist is fabricating on top of an already-cut fabrication. Replace with a **Configuration Health** indicator that's actually derivable — e.g., "5/5 codes have complete evidence schemas" — which is a real validation you can compute from your own config file.

---

## 5. Full "do not build" list (consolidated)

- Any button implying live network submission ("Send to Network," "Auto-Submit")
- Win rate, net recovery value, or any outcome-dependent metric
- A win-rate multiplier or win-rate-impact projection anywhere in the UI
- Reason code counts or evidence-schema counts higher than what's actually configured
- Generic evidence packets not filtered to the case's specific reason code
- An "Intelligence" nav section with no defined screen behind it

---

## 6. Antigravity implementation notes

- Frontend consumes the `DisputeResponsePacket` JSON (backend PRD §11) directly — don't have the UI re-derive completeness scores, gate decisions, or action labels client-side. If the UI computes anything the backend already computed, that's a second place for the two to drift out of sync, and an inconsistency between them is worse than either one being simple.
- Confidence gauges, distribution charts, and the failsafes table should all be driven by array/object shapes that map 1:1 to backend fields — build the components generic enough to take a `packets: DisputeResponsePacket[]` prop and derive every dashboard number from that single array client-side, rather than hardcoding per-card logic.
- Read-only for the hackathon: no screen should have a code path that calls out to a real or mocked payment network. If a "submit" action needs to do *something* for the demo to feel complete, have it write a new audit log row with actor `"human_override"` and stop there.

---

## 7. Build priority (if the five days run short, build in this order)

1. **Case Detail** — the screen judges click into; get the evidence-to-reason-code mapping and the rationale grounding exactly right, this is your credibility screen.
2. **Dashboard** — precision/recall/false-positive card + High-Value Failsafes table. This is where the track's actual scoring criteria are visible at a glance.
3. **Dispute Worklist** — needed to navigate into Case Detail, but its own polish matters less than the two above.
4. **Aegis DNA** — strong "expose the deterministic engine" value, build if time allows.
5. **Audit Logs** — the table itself is simple once the schema exists; the Eval Snapshot card can reuse the same computation as the dashboard's precision/recall card.

---

## 8. Acceptance criteria for frontend

- [ ] Every number on every screen traces to a named backend field or eval-script output — no exceptions, spot-check against backend PRD §11 schema before demo recording
- [ ] Case Detail's evidence packet changes per reason code — verify by opening one case of each of the 5 supported codes
- [ ] No button, label, or copy anywhere implies live network submission
- [ ] "Aegis" appears consistently — zero remaining "Sentinel" or "Chargeback Sentinel" references in the UI
- [ ] Minimum Confidence Score shown in Aegis DNA matches the actual gate threshold enforced in code (backend PRD §7.1.3)
