import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAegisWorkflow } from './pipeline.js';
import { auditStore } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYNTHETIC_DATASET_PATH = path.join(__dirname, 'data', 'synthetic_cases_50.json');

export function runBatchEvaluation() {
  console.log("================================================================================");
  console.log("🛡️  AEGIS AI RISK MANAGER — FULL-SCALE 50+ SYNTHETIC BENCHMARK EVALUATION");
  console.log("================================================================================\n");

  if (!fs.existsSync(SYNTHETIC_DATASET_PATH)) {
    console.error(`❌ Dataset file not found at: ${SYNTHETIC_DATASET_PATH}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(SYNTHETIC_DATASET_PATH, 'utf-8');
  const dataset = JSON.parse(rawData);

  console.log(`📦 Loaded ${dataset.length} synthetic chargeback test cases from synthetic_cases_50.json\n`);

  let passedTests = 0;
  let tp = 0; // True Positive: Ground truth CONTEST correctly classified as CONTEST
  let fp = 0; // False Positive: Ground truth ESCALATE incorrectly allowed as CONTEST
  let tn = 0; // True Negative: Ground truth ESCALATE correctly escalated
  let fn = 0; // False Negative: Ground truth CONTEST incorrectly escalated
  let escalatedCount = 0;

  const testResults = [];
  const categoryStats = {
    strong_evidence: { total: 0, passed: 0 },
    weak_evidence: { total: 0, passed: 0 },
    edge_case: { total: 0, passed: 0 }
  };

  dataset.forEach((testCase, idx) => {
    const caseRecord = runAegisWorkflow(testCase);

    const actionMatch = caseRecord.action === testCase.expected_action;
    const ruleMatch = caseRecord.gate_decision.rule_id === (testCase.expected_rule || "NONE");
    const testPassed = actionMatch && ruleMatch;

    if (testPassed) passedTests++;

    const cat = testCase.category_type || 'strong_evidence';
    if (categoryStats[cat]) {
      categoryStats[cat].total++;
      if (testPassed) categoryStats[cat].passed++;
    }

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
      index: idx + 1,
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

    const statusSymbol = testPassed ? "✅ PASS" : "❌ FAIL";
    console.log(`[#${String(idx + 1).padStart(2, '0')}] ${testCase.chargeback_id.padEnd(16)} | Code: ${testCase.reason_code.padEnd(6)} | Action: ${caseRecord.action.padEnd(17)} | Rule: ${(caseRecord.gate_decision.rule_id || 'NONE').padEnd(26)} | ${statusSymbol}`);
  });

  // Calculate Statistical Metrics
  const total = dataset.length;
  const accuracy = (passedTests / total) * 100;
  const precision = (tp + fp) > 0 ? (tp / (tp + fp)) * 100 : 100.0;
  const recall = (tp + fn) > 0 ? (tp / (tp + fn)) * 100 : 100.0;
  const fpr = (fp + tn) > 0 ? (fp / (fp + tn)) * 100 : 0.0;
  const escalationRate = (escalatedCount / total) * 100;

  console.log("\n================================================================================");
  console.log("📊 AEGIS 50+ BENCHMARK METRICS SUMMARY");
  console.log("================================================================================");
  console.table([
    { Metric: "Total Dataset Records", Value: `${total} Records`, Target: ">= 50", Status: "COMPLETE" },
    { Metric: "Accuracy / Overall Pass Rate", Value: `${accuracy.toFixed(1)}% (${passedTests}/${total})`, Target: "100.0%", Status: accuracy === 100 ? "OPTIMAL" : "DEGRADED" },
    { Metric: "Precision", Value: `${precision.toFixed(1)}%`, Target: ">= 95.0%", Status: precision >= 95 ? "PASS" : "FAIL" },
    { Metric: "Recall", Value: `${recall.toFixed(1)}%`, Target: ">= 90.0%", Status: recall >= 90 ? "PASS" : "FAIL" },
    { Metric: "False-Positive Rate (FPR)", Value: `${fpr.toFixed(1)}%`, Target: "<= 2.0%", Status: fpr <= 2.0 ? "PASS" : "FAIL" },
    { Metric: "Escalation Rate", Value: `${escalationRate.toFixed(1)}% (${escalatedCount}/${total})`, Target: "Ground Truth Match", Status: "GUARDED" }
  ]);

  console.log("--------------------------------------------------------------------------------");
  console.log("📑 Distribution Breakdown:");
  console.log(`  - Strong Evidence (~60%) : ${categoryStats.strong_evidence.passed}/${categoryStats.strong_evidence.total} Passed (${Math.round((categoryStats.strong_evidence.total/total)*100)}% of dataset)`);
  console.log(`  - Weak Evidence   (~25%) : ${categoryStats.weak_evidence.passed}/${categoryStats.weak_evidence.total} Passed (${Math.round((categoryStats.weak_evidence.total/total)*100)}% of dataset)`);
  console.log(`  - Edge Cases      (~15%) : ${categoryStats.edge_case.passed}/${categoryStats.edge_case.total} Passed (${Math.round((categoryStats.edge_case.total/total)*100)}% of dataset)`);

  // Persist this full benchmark report into server/audit_store.json
  const evalSummary = {
    id: `eval_run_batch_${Date.now()}`,
    run_at: new Date().toISOString(),
    total_tests: total,
    passed_tests: passedTests,
    accuracy: `${accuracy.toFixed(1)}%`,
    precision: `${precision.toFixed(1)}%`,
    recall: `${recall.toFixed(1)}%`,
    false_positive_rate: `${fpr.toFixed(1)}%`,
    escalation_rate: `${escalationRate.toFixed(1)}%`,
    protocol: "Full 50+ synthetic dispute benchmark suite testing deterministic classification, retrieval, arithmetic scoring, and failsafe gates.",
    results: testResults
  };

  const storedRun = auditStore.recordEvalRun(evalSummary);
  console.log(`\n📝 Benchmark run successfully recorded to audit_store.json [Run ID: ${storedRun.id}]`);
  console.log("🌐 Served via GET /api/eval-runs/current and GET /api/eval-runs/current/report");
  console.log("================================================================================\n");

  return evalSummary;
}

runBatchEvaluation();
