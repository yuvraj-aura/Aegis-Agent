# PRD Patch v2 — Risk Command Center: Fix Backtest Benchmark to Match Real Eval Script
**Product:** Aegis (Chargeback Sentinel)
**Screen:** Risk Command Center — Backtest Benchmark section only
**Status:** For implementation (patch to existing screen, not a rebuild)
**Depends on:** `PRD_Risk_Command_Center.md` (already implemented), supersedes `PRD_Patch_Risk_Command_Center_Labels.md`

---

## 1. What Was Found

`eval.js` was reviewed directly. It runs **5 hand-crafted test cases** (1 clean pass case + 4 deliberate failure injections: unknown reason code, fraud contradiction, missing evidence, high-value ceiling breach). For each case it checks whether the pipeline's actual `action` and `gate_decision.rule_id` match the expected values, and prints a pass/fail count.

**It does not calculate Precision, Recall, or False-Positive Rate anywhere in the code.** The dashboard's current values — 98.2% / 94.5% / 1.1%, N=52 — have no connection to this script's output and cannot currently be traced to any real computation. This must be fixed before this screen is shown to anyone evaluating the product.

The `CB-HIGH-VALUE` case ID seen in the High-Value Failsafes table is a hardcoded fixture from this eval script (`test case #5`) — confirming it is test data, not a real generated case, and should never appear in a production-facing view.

---

## 2. Required Fix — Replace Fabricated Metrics With Real Ones

**Delete Precision / Recall / False-Positive Rate from the Backtest Benchmark box entirely.** They are not currently computable from anything that exists. Do not keep them with new captions — remove the metrics themselves.

**Replace with what the eval script actually proves:**

### New Backtest Benchmark box content:
- **Header:** `Backtest Benchmark` (unchanged)
- **Subheader:** `{passed}/{total} failure-injection tests passed · Last run {eval_run_date}` — e.g. `5/5 failure-injection tests passed · Last run Aug 30, 2026`
- **Main stat:** `{passed}/{total}` rendered large (same visual weight as the old "98.2%"), with a green checkmark if `passed === total`.
- **Breakdown list below** (this is the actual valuable content — show what was tested):

| Test | Result |
|---|---|
| Unknown reason code → forces escalation | ✓ Pass |
| Prior fraud contradiction → forces escalation | ✓ Pass |
| Insufficient evidence (< completeness threshold) → forces escalation | ✓ Pass |
| High-value ceiling breach (>$10,000) → forces escalation | ✓ Pass |
| Clean case with full evidence → correctly eligible for contest | ✓ Pass |

Each row's label and pass/fail state must be generated dynamically from the actual `TEST_DATASET` and its results in `eval.js` — not hardcoded text in the frontend. If a new failure-injection case is added to `eval.js` later, this table should show it automatically without a frontend code change.

- **Link/button:** `View Full Eval Output` — opens the raw console output or a structured JSON version of the same, showing every field logged per test case (completeness score, gate rule, rationale, pass/fail) — this is your actual "traceable source," and it's more convincing to a technical judge than a bare percentage would have been.

---

## 3. Backend Changes Required

### 3.1 `eval.js` must write structured output, not just console.log
Currently the script only prints to console. It needs to also write a structured result (JSON) so the frontend can read it.

```js
// At the end of runEvaluation(), after the loop:
const results = TEST_DATASET.map((testCase, i) => ({
  chargeback_id: testCase.chargeback_id,
  reason_code: testCase.reason_code,
  expected_action: testCase.expected_action,
  expected_rule: testCase.expected_rule,
  // actual result fields captured during the loop, keyed by chargeback_id
}));

const summary = {
  run_at: new Date().toISOString(),
  total: TEST_DATASET.length,
  passed: passedTests,
  results: results // full per-case breakdown
};

// Write this to a file or insert into the eval_runs table (see PRD_Risk_Command_Center.md §4.1)
```

### 3.2 `eval_runs` table — update to match what's real
Per the original `PRD_Risk_Command_Center.md` §4.1, but with corrected fields since precision/recall/fp_rate cannot currently be populated honestly:

```
eval_runs {
  id              string (PK)
  total_tests     int              -- from TEST_DATASET.length
  passed_tests    int              -- from passedTests
  run_at          timestamp
  results         jsonb            -- full array of per-test-case results (case id, expected vs actual action/rule, pass/fail)
  report_url      string           -- link to full raw output if stored separately
  is_current      boolean
}
```
Drop `precision`, `recall`, `fp_rate` columns (or leave them nullable for later — see §4) — do not populate them with invented values.

### 3.3 Remove `CB-HIGH-VALUE` and other eval fixture IDs from any production-reachable database
Confirm with the data infra engineer that `eval.js`'s `TEST_DATASET` writes to a **separate test/eval database or table**, not the same `cases` table that powers Dispute Worklist and the Live Queue Snapshot. If `runAegisWorkflow` + `auditStore.recordCase` currently write eval test cases into the same `cases` table used in production views, that's the root cause of `CB-HIGH-VALUE` leaking into the High-Value Failsafes table — fix the data isolation, not just the display.

---

## 4. If You Want Real Precision/Recall/FP-Rate Later (Not Required for This Patch)

Precision/Recall/FP-Rate only make sense as metrics if you have a dataset large enough and varied enough to have real true positives, false positives, true negatives, and false negatives — e.g. cases that *should* auto-clear vs cases that *shouldn't*, tested at volume. 5 hand-picked cases isn't that dataset; it's a targeted regression suite proving specific failsafes work, which is arguably more convincing for this product anyway. If a bigger statistical eval set gets built later (the "50+ record" set mentioned in earlier product context), that's a separate, future PRD — do not backfill fake numbers now to fill the gap.

---

## 5. Testing Checklist Before This Patch Ships
- [ ] Backtest Benchmark box shows real pass/fail counts pulled from actual `eval_runs.results`, matching what running `eval.js` locally produces.
- [ ] No Precision/Recall/FP-Rate percentage appears anywhere on this screen unless backed by real computed values (not applicable in this patch — they're removed).
- [ ] `View Full Eval Output` shows the real per-test-case breakdown, not a summary that hides detail.
- [ ] `CB-HIGH-VALUE` and any other `eval.js` fixture IDs no longer appear in the High-Value Failsafes table or anywhere in the live `cases` view — confirmed by checking eval data writes to an isolated table/DB.
- [ ] Re-running `eval.js` after a pipeline change updates the dashboard's numbers (confirms it's live-read, not a one-time hardcoded snapshot).

---

**Sign-off required from:** Aryan (confirms the "5/5 failure injections passed" framing is what you want to show judges), ADK engineer (confirms eval/production data isolation).
