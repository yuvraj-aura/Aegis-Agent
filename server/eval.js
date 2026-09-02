import { runAegisWorkflow } from './pipeline.js';
import { auditStore } from './db.js';

// The 5 Core Adversarial Failure Injection + Clean Test Cases
export const TEST_DATASET = [
  // 1. Clean CONTEST case (Visa 10.4 Unauthorized - all 4 fields present)
  {
    chargeback_id: "CB-104-PASS",
    test_name: "Clean case with full evidence -> correctly eligible for contest",
    reason_code: "10.4",
    transaction_id: "txn_001",
    amount: 850.00,
    currency: "USD",
    dispute_deadline: "2026-09-10",
    customer_id: "cust_101",
    raw_transaction_data: {
      avs_cvv_match: "Full Match (AVS Y / CVV M)",
      device_ip_match: "192.168.1.100 (Known Device)",
      prior_order_history: "15 successful transactions",
      customer_comm_log: "Customer email acknowledging order",
      prior_fraud_flags: 0
    },
    expected_action: "CONTEST",
    expected_rule: "NONE",
    ground_truth: "CONTEST"
  },

  // 2. High-Value Ceiling Failure (> $10,000) -> Must force ESCALATE
  {
    chargeback_id: "CB-HIGH-VALUE",
    test_name: "High-value ceiling breach (>$10,000) -> forces escalation",
    reason_code: "10.4",
    transaction_id: "txn_005",
    amount: 14500.00, // Exceeds $10,000 ceiling
    currency: "USD",
    dispute_deadline: "2026-09-05",
    customer_id: "cust_105",
    raw_transaction_data: {
      avs_cvv_match: "Match",
      device_ip_match: "Match",
      prior_order_history: "5 orders",
      customer_comm_log: "Comm verified",
      prior_fraud_flags: 0
    },
    expected_action: "ESCALATE_TO_HUMAN",
    expected_rule: "HIGH_VALUE_CEILING",
    ground_truth: "ESCALATE"
  },

  // 3. High Completeness + Prior Fraud Contradiction -> Must force ESCALATE
  {
    chargeback_id: "CB-CONTRADICT-01",
    test_name: "Prior fraud contradiction -> forces escalation",
    reason_code: "13.1",
    transaction_id: "txn_003",
    amount: 450.00,
    currency: "USD",
    dispute_deadline: "2026-09-08",
    customer_id: "cust_103",
    raw_transaction_data: {
      delivery_tracking: "FEDEX_772910",
      carrier_delivery_confirmation: "Signed by Customer on porch",
      customer_comm_log: "Email thread confirming delivery location",
      prior_fraud_flags: 3 // Contradiction rule triggered!
    },
    expected_action: "ESCALATE_TO_HUMAN",
    expected_rule: "PRIOR_FRAUD_CONTRADICTION",
    ground_truth: "ESCALATE"
  },

  // 4. Missing Critical Fields (Completeness < 75%) -> Must force ESCALATE
  {
    chargeback_id: "CB-MISSING-GAPS",
    test_name: "Insufficient evidence (< completeness threshold) -> forces escalation",
    reason_code: "13.3",
    transaction_id: "txn_004",
    amount: 190.00,
    currency: "USD",
    dispute_deadline: "2026-09-15",
    customer_id: "cust_104",
    raw_transaction_data: {
      product_listing_snapshot: "Snapshot of Item SKU-88",
      prior_fraud_flags: 0
    },
    expected_action: "ESCALATE_TO_HUMAN",
    expected_rule: "INSUFFICIENT_EVIDENCE",
    ground_truth: "ESCALATE"
  },

  // 5. Unknown Reason Code -> Must force ESCALATE
  {
    chargeback_id: "CB-UNKNOWN-ERR",
    test_name: "Unknown reason code -> forces escalation",
    reason_code: "99.9_UNKNOWN",
    transaction_id: "txn_002",
    amount: 320.00,
    currency: "USD",
    dispute_deadline: "2026-09-12",
    customer_id: "cust_102",
    raw_transaction_data: {
      delivery_tracking: "TRK987654",
      customer_comm_log: "User requested return"
    },
    expected_action: "ESCALATE_TO_HUMAN",
    expected_rule: "UNKNOWN_REASON_CODE",
    ground_truth: "ESCALATE"
  }
];

export function runEvaluation() {
  console.log("================================================================================");
  console.log("🛡️  AEGIS AI RISK MANAGER — ADVERSARIAL BENCHMARK & REGRESSION EVALUATION SUITE");
  console.log("================================================================================\n");

  let passedTests = 0;
  const testResults = [];

  let tp = 0; // True Positive: Eligible CONTEST correctly allowed
  let fp = 0; // False Positive: Escalated case incorrectly allowed as CONTEST
  let tn = 0; // True Negative: Escalated case correctly flagged
  let fn = 0; // False Negative: Eligible CONTEST incorrectly escalated
  let escalatedCount = 0;

  for (const testCase of TEST_DATASET) {
    const caseRecord = runAegisWorkflow(testCase);

    const actionMatch = caseRecord.action === testCase.expected_action;
    const ruleMatch = caseRecord.gate_decision.rule_id === (testCase.expected_rule || "NONE");

    // Invariant check: require_manual_review MUST mean escalate_human
    if (caseRecord.gate_decision.action === 'require_manual_review') {
      if (caseRecord.worklist_action_available !== 'escalate_human') {
        console.error(`❌ INVARIANT VIOLATION: require_manual_review had action ${caseRecord.worklist_action_available}`);
      }
    }

    const testPassed = actionMatch && ruleMatch;
    if (testPassed) passedTests++;

    if (caseRecord.action === "ESCALATE_TO_HUMAN" || caseRecord.gate_decision.action === 'require_manual_review') {
      escalatedCount++;
    }

    // Confusion Matrix Accounting
    if (testCase.ground_truth === "CONTEST") {
      if (caseRecord.action === "CONTEST") tp++;
      else fn++;
    } else {
      if (caseRecord.action === "CONTEST") fp++;
      else tn++;
    }

    testResults.push({
      chargeback_id: testCase.chargeback_id,
      test_name: testCase.test_name,
      reason_code: testCase.reason_code,
      expected_action: testCase.expected_action,
      expected_rule: testCase.expected_rule || "NONE",
      actual_action: caseRecord.action,
      actual_rule: caseRecord.gate_decision.rule_id,
      completeness_score: caseRecord.completeness_score,
      rationale: caseRecord.rationale,
      passed: testPassed
    });

    console.log(`[TEST CASE] ${testCase.chargeback_id} (Reason Code: ${testCase.reason_code})`);
    console.log(`  - Description       : ${testCase.test_name}`);
    console.log(`  - Amount            : $${testCase.amount.toFixed(2)} ${testCase.currency}`);
    console.log(`  - Completeness Score: ${caseRecord.completeness_score}%`);
    console.log(`  - Gate Rule Fired   : ${caseRecord.gate_decision.rule_id} [Expected: ${testCase.expected_rule || 'NONE'}] ${ruleMatch ? '✓' : '✗'}`);
    console.log(`  - Action Decided    : ${caseRecord.action} [Expected: ${testCase.expected_action}] ${actionMatch ? '✓' : '✗'}`);
    console.log(`  - Evaluation Result : ${testPassed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  - Grounded Rationale: "${caseRecord.rationale}"\n`);
  }

  // Statistical Metrics Computation
  const precision = (tp + fp) > 0 ? (tp / (tp + fp)) * 100 : 100.0;
  const recall = (tp + fn) > 0 ? (tp / (tp + fn)) * 100 : 100.0;
  const fpr = (fp + tn) > 0 ? (fp / (fp + tn)) * 100 : 0.0;
  const escalationRate = (escalatedCount / TEST_DATASET.length) * 100;
  const passRate = (passedTests / TEST_DATASET.length) * 100;

  console.log("================================================================================");
  console.log("📊 AEGIS REGRESSION & ADVERSARIAL BENCHMARK METRICS");
  console.log("================================================================================");
  console.table([
    { Metric: "Total Test Cases", Value: TEST_DATASET.length, Target: "5 Cases", Status: "COMPLETE" },
    { Metric: "Passed Tests", Value: `${passedTests} / ${TEST_DATASET.length}`, Target: "5 / 5", Status: passedTests === TEST_DATASET.length ? "PASS" : "FAIL" },
    { Metric: "Benchmark Pass Rate", Value: `${passRate.toFixed(1)}%`, Target: "100.0%", Status: passRate === 100 ? "OPTIMAL" : "DEGRADED" },
    { Metric: "Precision", Value: `${precision.toFixed(1)}%`, Target: ">= 95.0%", Status: precision >= 95 ? "PASS" : "FAIL" },
    { Metric: "Recall", Value: `${recall.toFixed(1)}%`, Target: ">= 90.0%", Status: recall >= 90 ? "PASS" : "FAIL" },
    { Metric: "False-Positive Rate (FPR)", Value: `${fpr.toFixed(1)}%`, Target: "<= 2.0%", Status: fpr <= 2.0 ? "PASS" : "FAIL" },
    { Metric: "Escalation Rate", Value: `${escalationRate.toFixed(1)}%`, Target: "Adversarial", Status: "GUARDED" }
  ]);

  // Record structured output directly to eval_runs table in audit_store.json
  const evalSummary = {
    run_at: new Date().toISOString(),
    total: TEST_DATASET.length,
    passed: passedTests,
    pass_rate: `${passRate.toFixed(1)}%`,
    precision: `${precision.toFixed(1)}%`,
    recall: `${recall.toFixed(1)}%`,
    false_positive_rate: `${fpr.toFixed(1)}%`,
    escalation_rate: `${escalationRate.toFixed(1)}%`,
    results: testResults
  };

  const storedRun = auditStore.recordEvalRun(evalSummary);
  console.log(`📝 Benchmark run recorded to eval_runs table in audit_store.json [Run ID: ${storedRun.id}]`);
  console.log("================================================================================\n");

  return evalSummary;
}

runEvaluation();
