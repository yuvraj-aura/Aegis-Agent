# Chargeback Sentinel — Product Requirements Document
**Track:** 02 — AI Risk Manager, Razorpay AI Buildathon
**Owner:** Aryan (Product) | **Build lead:** ADK Engineer + Data Infra Engineer
**Status:** Ready for engineering handoff

---

## 0. How to use this document

This is written so an engineer can start building without needing a follow-up conversation with the founder for anything *technical*. Section 7.1 originally flagged several product/business decisions as founder input — those have now been researched and pre-filled with sourced defaults (or clearly marked engineering defaults where no public standard exists). Section 15 is a one-page sign-off checklist if you want to review or override anything; it does not block engineering.

---

## 1. Important clarification before anyone starts building

**This agent does not require model training or fine-tuning.** There is no dataset you feed into a training loop to make the model "smarter" at chargebacks. The system is:
- A Gemini model (via ADK 2.0) doing tool-calling and language drafting
- Wrapped in deterministic Python logic that makes every consequential decision
- Grounded by a structured knowledge base (reason codes → required evidence → historical win rates) that **you define**, not something the model learns

The phrase "train the agent on data" doesn't apply here. What actually improves performance and prevents hallucination is **narrowing what the model is allowed to see and say**, not showing it more examples. Keep this framing in every conversation with your engineers — if anyone proposes fine-tuning, prompt-only "confidence," or feeding the LLM the full transaction record, that's the wrong architecture for this build. Point them back to Section 8.

---

## 2. Executive summary

Merchants lose winnable chargebacks because evidence compilation is slow and inconsistent. Chargeback Sentinel ingests a chargeback event, classifies it against a known reason-code schema, retrieves the relevant evidence, scores it deterministically, and either drafts a contest packet or refuses and escalates to a human — with every decision logged. The agent never submits anything to a payment network. It produces a packet; a human fires it.

The single hardest engineering requirement is that the agent must never assert a fact it cannot trace to a retrieved evidence field, and never assign confidence it did not calculate. This document is structured around that constraint first, features second.

---

## 3. Goals and non-goals

**In scope for the hackathon build:**
- End-to-end pipeline: event in → classification → evidence retrieval → scoring → gate → drafted packet → audit log
- Synthetic test dataset (50+ records) with measured precision/recall/false-positive rate on a held-out set
- A defense-only agent: it evaluates and drafts, it never contacts a real or simulated payment network to submit anything

**Explicitly out of scope — do not build these, even if they seem easy:**
- Live integration with Razorpay's real Dispute API or any production payment network
- Pulling real merchant order/delivery/communication data from live connected systems
- Any auto-submission path, configurable or not
- ROI-based "which disputes are worth fighting" logic
- Multi-payment-processor support
- Fine-tuning or training any model

If an engineer's estimate for a feature includes live API integration, that feature is out of scope — flag it back to the founder rather than building it. The track's own bar asks for **measured precision and recall on a held-out test set**, not live infrastructure. Scope creep here doesn't earn extra points; it just burns your five days.

---

## 4. Users and context

- **Primary "user" during the hackathon:** the judge, evaluating the demo and the eval script's output.
- **Simulated end user in the product narrative:** a merchant's ops/finance team member reviewing the packet before deciding whether to submit.
- **Post-hackathon (not this build):** actual merchants, if this advances past the ranking gate.

---

## 5. System architecture overview

```
Chargeback Event (synthetic, JSON)
        │
        ▼
 [1] Reason-Code Classifier  ──────► (deterministic lookup against schema library)
        │
        ▼
 [2] Evidence Retriever  ──────────► (pulls only fields defined by the schema for this code)
        │
        ▼
 [3] Evidence Completeness Scorer ──► (pure function, no LLM)
        │
        ▼
 [4] Failsafe Gate  ───────────────► (hard-coded rules; can force ESCALATE regardless of score)
        │
        ├── FAILS gate ──► ESCALATE_TO_HUMAN (skip LLM entirely, go straight to packet + log)
        │
        └── PASSES gate
                │
                ▼
        [5] Response Drafter (LLM) ──► receives ONLY the validated evidence object
                │
                ▼
        [6] Packet Assembler ────────► structured DisputeResponsePacket
                │
                ▼
        [7] Audit Logger (PostgreSQL) ── every run, every field, every decision
                │
                ▼
        [8] Antigravity Dashboard ──► renders packet, gate decision, evidence checklist
```

Steps 1–4 and 7 are pure code. Step 5 is the only step that touches an LLM. This separation is the entire point of the architecture — keep it visually and structurally obvious in the actual repo, because it's what you'll point the judge's eyes to.

---

## 6. Functional requirements, module by module

### 6.1 Reason-Code Classifier
- **Input:** raw chargeback event with a reason code string/number
- **Output:** matched schema entry, or `UNKNOWN_REASON_CODE` if no match
- **Logic:** exact lookup against the schema library (Section 7.2/7.3), no fuzzy matching, no LLM involvement
- **Prohibited:** guessing a "close enough" reason code. Unknown code → forced escalate, full stop.

### 6.2 Evidence Retriever
- **Input:** the matched schema entry (which fields are required) + the synthetic transaction record
- **Output:** an `evidence_object` with one entry per required field, each marked `present`, `missing`, or `unverifiable`
- **Logic:** literal field lookups only. If a field isn't in the transaction record, it's `missing` — never inferred, never defaulted to a plausible value.
- **Prohibited:** the retriever must not pass the LLM anything outside the schema's required-fields list, even if more data exists in the record. Extra visible data is extra surface area for hallucination.

### 6.3 Evidence Completeness Scorer
- **Input:** the `evidence_object`
- **Output:** a numeric completeness score (0.0–1.0), used directly as `confidence` in the output packet
- **Logic:** pure arithmetic — `present_fields / required_fields`. No win-rate multiplier: Section 7.1.4 explains why we deliberately dropped it rather than inventing a per-reason-code win-rate figure that doesn't exist in any public source. Deterministic: same input always produces the same output.
- **Prohibited:** no LLM call anywhere in this module. If an engineer implements this by asking Gemini "how confident are you," that is a build failure — flag and rebuild.

### 6.4 Failsafe Gate
- **Input:** completeness score, evidence object, transaction metadata (amount, customer dispute history)
- **Output:** `PASS` or `ESCALATE_TO_HUMAN`, plus which rule triggered if escalating
- **Hard-coded rules (thresholds sourced/defaulted in Section 7.1.3 — override anytime):**
  1. Completeness score below **75%** → escalate
  2. Customer has **≥2** prior fraud-flagged disputes on file → escalate, *even if completeness score is high* (this is the contradiction-detection rule — it exists specifically to catch cases where evidence looks clean but context says otherwise)
  3. Transaction amount exceeds the configured auto-handling ceiling (set your own — see 7.1.3 for how to pick it) → escalate
  4. Reason code is `UNKNOWN_REASON_CODE` → escalate
- **Prohibited:** the LLM must have no path to override a gate decision. The gate runs and completes before the Drafter is ever invoked.

### 6.5 Response Drafter (the only LLM step)
- **Input:** the validated `evidence_object` and the gate's decision — **nothing else**. Not the raw transaction record, not other disputes in the dataset, not general knowledge about "typical" chargeback patterns.
- **Output:** a rationale narrative, referencing only fields present in the evidence object it received
- **Logic:** if the gate decision is `ESCALATE_TO_HUMAN`, the Drafter writes a short explanation of *why* (missing fields, triggered rule) — it does not attempt to argue the case.
- **Prohibited:** stating anything about a field not in its input. This is enforced by never giving it access to anything else — see Section 8, Layer 1.

### 6.6 Packet Assembler
- Combines steps 1–5 into the final `DisputeResponsePacket` (schema in Section 11).

### 6.7 Audit Logger
- Every run writes one row to PostgreSQL: inputs, classification, evidence object, completeness score, gate decision + triggered rule, final action, timestamp. Immutable — no update/delete path in the schema.

### 6.8 Antigravity Dashboard
- Renders: packet list, per-packet evidence checklist (present/missing), gate decision with the specific rule that fired (if escalated), and the drafted rationale. Read-only for the hackathon — no submit button that does anything real.

---

## 7. Data requirements — the section you specifically asked about

This is split into three buckets: what only *you* can provide, what needs to be *sourced from the outside world*, and what the engineers *generate themselves*. Nobody should be waiting on anybody for something in the wrong bucket.

### 7.1 What's now defined for you (researched, sourced, ready to hand to engineers)
You said you don't have the domain background for these calls and asked me to fetch real-world data instead of leaving them open. Done — but with one important distinction kept visible throughout: some of this traces to a public, citable source, and some of it is an **engineering default** because no public standard exists for that particular number. Mixing those two up is exactly the mistake we caught in the last review, so they're labeled separately below rather than presented as one undifferentiated block of "facts."

**7.1.1 — The 5 reason codes to support**
Chosen to span materially different evidence types — more interesting for the demo than 5 codes that all need the same 3 fields — sourced from Visa and Mastercard's own published dispute categories:

| # | Category | Visa code | Mastercard code | What the cardholder is claiming |
|---|---|---|---|---|
| 1 | Goods/Services Not Received | 13.1 | 4855 | Never received what they paid for |
| 2 | Not as Described / Defective | 13.3 | 4853 | Received it, but it's wrong, damaged, or different |
| 3 | Duplicate Processing | 12.6.1 | 4834 | Charged more than once for one purchase |
| 4 | Unauthorized Transaction (card-not-present) | 10.4 | 4837 | Didn't authorize the charge at all |
| 5 | Credit Not Processed | 13.6 | 4860 | Was promised a refund that never landed |

**7.1.2 — Required evidence fields per code**
Condensed from the real evidence categories the networks recognize for each dispute type into a compact schema your engineers can build directly:

| Code | Required fields (synthetic schema) |
|---|---|
| Not Received (13.1 / 4855) | `delivery_tracking`, `carrier_delivery_confirmation`, `customer_comm_log` |
| Not as Described (13.3 / 4853) | `product_listing_snapshot`, `delivery_confirmation`, `customer_comm_log`, `return_policy_ack` |
| Duplicate Processing (12.6.1 / 4834) | `transaction_log`, `avs_cvv_match`, `customer_comm_log` |
| Unauthorized (10.4 / 4837) | `avs_cvv_match`, `device_ip_match`, `prior_order_history`, `customer_comm_log` |
| Credit Not Processed (13.6 / 4860) | `refund_transaction_log`, `refund_policy_ack`, `customer_comm_log` |

`customer_comm_log` recurring across every row isn't a shortcut — every one of these categories cites customer communication as relevant evidence in the source material.

**7.1.3 — Gate thresholds (mostly engineering defaults — flagged honestly)**
Card networks don't publish a universal "escalate below X% completeness" rule — that's an internal risk decision every processor makes for itself, not a network standard. So:
- **Completeness threshold: 75%.** *(Engineering default.)* Reasoning: tolerates one missing field out of a typical 3–4 required, but a case with more gaps than that is genuinely thin, not just imperfectly documented — escalate rather than draft around silence.
- **Prior-fraud-flag threshold: ≥2.** *(Engineering default.)* One flag could be a false positive; two or more is where a pattern is worth a human's attention. This is a common practical heuristic in fraud engineering, not a published network figure — don't present it as one if a judge asks.
- **Transaction amount ceiling: set this yourself, but here's a real anchor.** *(Sourced context, not a direct answer.)* Mastercard and Visa's own merchant-monitoring programs flag merchants once their chargeback-to-transaction *ratio* crosses roughly 1.5% (Mastercard) or 2% (Visa) — a merchant-level ratio, not a per-transaction dollar figure, so it doesn't translate directly into a ceiling. What it tells you is that networks think in ratios, not fixed dollar cutoffs. For the demo, pick a ceiling clearly above your synthetic dataset's median transaction amount so the rule visibly fires only on your intentionally-injected high-value edge case.

**7.1.4 — Win-rate baseline: dropped by design, not fabricated**
I looked for a public, per-reason-code win-rate table — the kind that would let "not received" disputes get weighted differently from "duplicate charge" disputes — and it doesn't exist. Win rates are proprietary to each processor's own historical data and vary heavily by merchant and evidence quality. Vendor marketing claims exist ("boost win rates by up to 35%") but those are promotional figures, not baseline data, and using them as fact would repeat the exact mistake corrected in the last review. The defensible move, reflected in Section 6.3: use the completeness score directly as confidence, with no invented multiplier. Simpler formula, honest about what's actually known, and a better fit for a track whose bar is explicitly "honest metrics."

### 7.2 Sourcing notes
- Reason code categories and evidence types: Stripe's public dispute documentation, which maps Visa/Mastercard/Amex network codes to their recognized evidence categories.
- Merchant chargeback-ratio monitoring figures (7.1.3): Stripe's public guide on average chargeback rates, referencing Mastercard's and Visa's merchant-monitoring programs.
- Friendly-fraud share-of-disputes range, if you want one for demo narrative only (not used anywhere in the scorer): Chargebacks911's 2024 Chargeback Field Report and Visa-owned Cybersource data cited via eMarketer disagree with each other (roughly 20% vs. "nearly half," depending on methodology) — if you cite either, name the specific report rather than averaging them into a false-precision number.

None of this required an account, a partnership, or API access — it's public documentation.

### 7.3 What the engineers generate themselves — synthetic dataset spec
No real transaction or customer data is needed or wanted for this build.

- **50+ synthetic chargeback records**, each with: reason code, transaction amount, customer ID (fake), and a transaction record containing the evidence fields relevant to that reason code (some populated, some deliberately missing).
- **Distribution:** ~60% strong evidence (should result in CONTEST), ~25% partial evidence (should result in ESCALATE via completeness threshold), ~15% contradictory/suspicious (strong evidence on paper, but fraud-flag history — should result in ESCALATE via the contradiction rule).
- **Every record needs a hand-labeled ground-truth action.** This is what your eval script scores against. This labeling is fast, mechanical work once the schema (7.1) is defined — doesn't need to wait on engineering.
- **Format:** flat JSON or CSV, one file, versioned — so if you regenerate the dataset later, old eval results stay reproducible against the old version.

### 7.4 What is explicitly NOT needed
- No real merchant PII, no real card numbers, no real customer data — synthetic only, for both legal and time-budget reasons.
- No live connection to Razorpay's production Dispute API.
- No training corpus, no fine-tuning dataset, no RLHF data. Reiterating Section 1: this isn't that kind of system.

---

## 8. Anti-hallucination requirements (hard acceptance criteria)

These are not "nice to have" — treat each as a blocking requirement before demo recording.

| Layer | Requirement | How to verify |
|---|---|---|
| 1. Evidence isolation | The Drafter LLM call receives *only* the validated evidence object — never the raw transaction record or other dataset records | Code review: inspect the exact payload sent to the LLM call |
| 2. Missing evidence is explicit | Any required field absent from the record appears in `missing_evidence` and is mentioned in the rationale | Run 5 records with deliberately missing fields; check rationale text mentions each gap |
| 3. Confidence is arithmetic | Completeness score is a pure function of retrieved data — same input always produces same output | Run the same record twice; scores must be identical |
| 4. Gate overrides the LLM | No code path exists where the Drafter's output can change the gate's PASS/ESCALATE decision | Code review: gate must execute and complete before Drafter is invoked, with no feedback loop |

**Spot-check before demo:** pull 10 random output packets, manually trace every claim in the rationale back to a field in that record's evidence object. If any claim doesn't trace, the isolation in Layer 1 has a leak — fix before recording.

---

## 9. Non-functional requirements
- **Latency:** not a judged criterion here — don't over-optimize. Correctness and auditability matter more than speed for this track.
- **Security/privacy:** synthetic data only, so this is low-stakes for the hackathon, but don't hardcode any real personal data even as a placeholder — use obviously fake names/emails.
- **Explainability:** every decision (gate pass/fail, which rule fired, completeness score breakdown) must be inspectable in the audit log without re-running the agent.

---

## 10. Technical stack and Antigravity notes
- **Orchestration:** Python, Google ADK 2.0, single agent with tool-calling — not a multi-agent swarm. This track rewards precision over architectural theater.
- **Model:** Gemini API, used only in the Drafter step.
- **Tools/functions to define:** `classify_reason_code()`, `fetch_transaction_record()`, `score_evidence_completeness()`, `check_failsafe_gate()`, `draft_rationale()`.
- **Database:** PostgreSQL for the audit log — matches your existing stack, no new infra to learn.
- **Frontend:** Antigravity, rendering the dashboard described in 6.8. Expose the `DisputeResponsePacket` as structured JSON that Antigravity's UI layer consumes directly — don't have the frontend re-derive anything the backend already computed.
- **MCP servers:** not required for this build — there's no external service this agent needs to call beyond the Gemini API itself. If a "fetch real dispute data" MCP tool gets proposed, that's scope creep per Section 3 — decline it.

---

## 11. Schema definitions

**Input event:**
```json
{
  "chargeback_id": "string",
  "reason_code": "string",
  "transaction_id": "string",
  "amount": "number",
  "currency": "string",
  "dispute_deadline": "ISO date",
  "customer_id": "string"
}
```

**Output packet:**
```json
{
  "chargeback_id": "string",
  "action": "CONTEST | ACCEPT_LOSS | ESCALATE_TO_HUMAN",
  "confidence": "number (0.0–1.0)",
  "evidence_used": [
    {"field": "string", "status": "present | missing | unverifiable", "source": "string"}
  ],
  "missing_evidence": ["string"],
  "rationale": "string",
  "gate_decision": {"passed": "boolean", "rule_triggered": "string | null"},
  "timestamp": "ISO datetime"
}
```

**Audit log row (PostgreSQL):** mirrors the output packet exactly, plus the raw input event, for full input→output traceability per run.

---

## 12. Testing and evaluation plan
1. **Unit tests** on the classifier, retriever, scorer, and gate — each testable with zero LLM calls, zero API cost. Build and pass these before touching the LLM layer at all.
2. **The three deliberate failure injections** (already scoped in the buildspec, restated here as test cases):
   - Unrecognized reason code → must force escalate
   - High completeness score + fraud-flagged customer history → must force escalate via the contradiction rule, not the completeness rule
   - Missing critical field → must populate `missing_evidence` and cap confidence, never fabricate
3. **Eval script** runs all 50+ labeled records and reports: precision/recall on CONTEST vs ACCEPT_LOSS calls, false-positive rate (recommending CONTEST when ground truth says the evidence was actually weak), and escalation rate. Output as numbers in a table, not prose.
4. **Reproducibility check:** run the full 50-record set twice; results must be identical both times (confirms Layer 3 of Section 8 holds).

---

## 13. Build sequence (order matters — do not build the Drafter first)
1. Engineers can start immediately — Section 7.1 has the reason codes, evidence fields, and thresholds already defined and sourced. Founder should skim Section 15 once, but it's a sign-off, not a blocker.
2. Engineer builds classifier + retriever against synthetic data (no LLM yet).
3. Engineer builds the completeness scorer, unit-tests it against edge cases (zero fields present, all present, contradictory).
4. Engineer builds the failsafe gate as a standalone module, testable via JSON input/output with zero API calls.
5. Only now wire in the Drafter LLM call, constrained per Layer 1.
6. Build the audit logger and PostgreSQL schema.
7. Founder (or data infra engineer) generates and labels the 50+ record synthetic dataset per 7.3.
8. Build and run the eval script; iterate on the schema/thresholds if metrics look off, not on the prompt.
9. Wire the Antigravity dashboard to the packet output.
10. Run the full acceptance checklist (Section 14) before recording the demo.

---

## 14. Definition of done
- [ ] Gate module runs standalone with zero LLM calls, correctly handles all 3 injected failure cases
- [ ] Drafter's rationale never references a field absent from its input evidence object (10-record spot-check passed)
- [ ] Confidence scores are reproducible on repeat runs with identical input
- [ ] Every run produces exactly one immutable audit log row with gate decision and triggered rule
- [ ] Eval script outputs precision, recall, and false-positive rate as numbers
- [ ] No reason code, evidence requirement, or statistic in the demo or docs is unsourced or invented — everything traces to Section 7.1/7.2 or a cited report

---

## 15. Founder sign-off checklist (optional — defaults are already applied)
Everything below is pre-filled in Section 7.1 with sourcing attached. Nothing here blocks engineering — skim once and override anything that doesn't fit the merchant story you want to demo:
1. The 5 reason codes (7.1.1) — swap any if you want a different narrative
2. Evidence fields per code (7.1.2) — add fields for a richer demo; don't remove without checking the source category first
3. Completeness threshold: 75% (7.1.3, engineering default) — raise it for a more conservative-looking gate
4. Prior-fraud-flag threshold: ≥2 (7.1.3, engineering default)
5. Transaction amount ceiling (7.1.3) — the one number you genuinely need to pick yourself, once your synthetic dataset's amount range exists
6. Win-rate multiplier: deliberately dropped (7.1.4) — don't reintroduce one without a real source

---

## 16. Appendix — source documentation

Visa organizes reason codes into four categories by first two digits: `10.x` = fraud, `11.x` = authorization issues, `12.x` = processing errors, `13.x` = customer disputes. Mastercard uses four parallel categories: Authorization, Cardholder Disputes, Fraud, and Processing Errors.

The full reason-code-to-evidence mapping behind Section 7.1 comes from Stripe's public dispute documentation, which consolidates Visa, Mastercard, and Amex network requirements in one place. Worth a direct read if you want to add a 6th reason code later or extend an existing evidence schema beyond the compact version in 7.1.2 — the source has more granularity than what's reflected here. Verify against current network docs before finalizing anything for production use, since these categories are periodically revised by the networks.
