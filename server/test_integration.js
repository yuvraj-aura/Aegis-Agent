// test_integration.js
const TEST_CASE_ID = "CB-104-PASS";
const PREPARE_URL = `http://localhost:8000/api/cases/${TEST_CASE_ID}/prepare-packet`;

async function testPreparePacket() {
  console.log("================================================================");
  console.log("[INTEGRATION TEST] POST /api/cases/:id/prepare-packet");
  console.log(`[TARGET URL] ${PREPARE_URL}`);
  console.log("================================================================\n");

  try {
    const response = await fetch(PREPARE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    console.log(`[HTTP STATUS]: ${response.status} ${response.statusText}`);
    const body = await response.json();
    console.log("\n[RESPONSE BODY]:");
    console.log(JSON.stringify(body, null, 2));

    // Validations
    console.log("\n[VALIDATION CHECKS]:");
    const checks = [
      { name: "chargeback_id is CB-104-PASS", pass: body.chargeback_id === TEST_CASE_ID },
      { name: "action is 'CONTEST'", pass: body.action === "CONTEST" },
      { name: "confidence is present and numeric", pass: typeof body.confidence === "number" },
      { name: "evidence_used is array", pass: Array.isArray(body.evidence_used) && body.evidence_used.length > 0 },
      { name: "missing_evidence is array", pass: Array.isArray(body.missing_evidence) },
      { name: "rationale is object with required keys", pass: body.rationale && 
          body.rationale.summary_statement && 
          body.rationale.evidence_narrative && 
          body.rationale.missing_evidence_acknowledgment && 
          body.rationale.conclusion },
      { name: "gate_decision is present", pass: !!body.gate_decision },
      { name: "timestamp is valid ISO string", pass: !isNaN(Date.parse(body.timestamp)) }
    ];

    let allPassed = true;
    for (const check of checks) {
      if (check.pass) {
        console.log(`  [PASS] ${check.name}`);
      } else {
        console.log(`  [FAIL] ${check.name}`);
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log("\n[RESULT] ALL INTEGRATION CHECKS PASSED!");
    } else {
      console.log("\n[RESULT] SOME INTEGRATION CHECKS FAILED.");
      process.exit(1);
    }
  } catch (err) {
    console.error("\n[ERROR] Request failed:", err);
    process.exit(1);
  }
}

testPreparePacket();
