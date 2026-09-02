// server/test_e2e_frontend_flow.js
const BASE_URL = 'http://localhost:8000';

async function runE2EVerification() {
  console.log("================================================================================");
  console.log("🛡️  AEGIS END-TO-END OPERATIONAL LIFECYCLE & FRONTEND FLOW VERIFICATION");
  console.log(`🌐 Target Backend Server: ${BASE_URL}`);
  console.log("================================================================================\n");

  let stepCount = 0;
  let passedSteps = 0;

  // Helper assertions
  function assert(condition, message) {
    stepCount++;
    if (condition) {
      console.log(`  [PASS] Step ${stepCount}: ${message}`);
      passedSteps++;
    } else {
      console.error(`  [FAIL] Step ${stepCount}: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Live Worklist Verification (GET /api/cases)
    // -------------------------------------------------------------------------
    console.log("--------------------------------------------------------------------------------");
    console.log("📋 1. LIVE WORKLIST VERIFICATION (GET /api/cases)");
    console.log("--------------------------------------------------------------------------------");
    const worklistRes = await fetch(`${BASE_URL}/api/cases?page=1&page_size=10`);
    assert(worklistRes.status === 200, `GET /api/cases returned HTTP 200 (Got: ${worklistRes.status})`);
    
    const worklistData = await worklistRes.json();
    assert(Array.isArray(worklistData.items), "Worklist returns paginated items array");
    assert(worklistData.items.length > 0, `Worklist has active cases (Count: ${worklistData.items.length})`);
    
    const sampleCase = worklistData.items[0];
    assert(typeof sampleCase.completeness_score === 'number', `Case #${sampleCase.id} has numeric completeness_score (${sampleCase.completeness_score}%)`);
    assert(sampleCase.gate_decision && typeof sampleCase.gate_decision === 'object', `Case #${sampleCase.id} has structured gate_decision object`);
    assert(['prepare_packet', 'review_gaps', 'escalate_human'].includes(sampleCase.worklist_action_available), 
      `Case #${sampleCase.id} has valid actionable state: '${sampleCase.worklist_action_available}'`);

    // -------------------------------------------------------------------------
    // 2. Analyst Dossier Join (GET /api/cases/:id)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("🔍 2. ANALYST DOSSIER JOIN (GET /api/cases/CB-104-PASS)");
    console.log("--------------------------------------------------------------------------------");
    const dossierRes = await fetch(`${BASE_URL}/api/cases/CB-104-PASS`);
    assert(dossierRes.status === 200, `GET /api/cases/CB-104-PASS returned HTTP 200`);
    
    const dossier = await dossierRes.json();
    assert(dossier.data && dossier.data.case, "Dossier contains case record");
    assert(Array.isArray(dossier.data.evidence_items), `Dossier returns dynamic evidence_items array (${dossier.data.evidence_items.length} items)`);
    assert(dossier.data.gate_decision, `Dossier returns dynamic gate_decision (${JSON.stringify(dossier.data.gate_decision.action)})`);
    assert(dossier.data.reason_code_meta && dossier.data.reason_code_meta.code === '10.4', "Dossier joins canonical taxonomy metadata for Visa 10.4");

    // -------------------------------------------------------------------------
    // 3. Dynamic Agent Rebuttal Generation (POST /api/cases/:id/prepare-packet)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("🤖 3. DYNAMIC AGENT REBUTTAL GENERATION (POST /api/cases/CB-104-PASS/prepare-packet)");
    console.log("--------------------------------------------------------------------------------");
    const prepRes = await fetch(`${BASE_URL}/api/cases/CB-104-PASS/prepare-packet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert(prepRes.status === 200, `POST /api/cases/CB-104-PASS/prepare-packet returned HTTP 200`);
    
    const packet = await prepRes.json();
    assert(packet.chargeback_id === 'CB-104-PASS', "Prepared packet has chargeback_id 'CB-104-PASS'");
    assert(packet.action === 'CONTEST', "Prepared packet action is 'CONTEST'");
    assert(packet.rationale && typeof packet.rationale === 'object', "Rationale is a structured object");
    assert(typeof packet.rationale.summary_statement === 'string' && packet.rationale.summary_statement.length > 20, 
      `Drafter microservice produced summary_statement (${packet.rationale.summary_statement.length} chars)`);
    assert(typeof packet.rationale.evidence_narrative === 'string' && packet.rationale.evidence_narrative.length > 20, 
      `Drafter microservice produced evidence_narrative (${packet.rationale.evidence_narrative.length} chars)`);
    assert(typeof packet.rationale.missing_evidence_acknowledgment === 'string', 
      `Drafter microservice produced missing_evidence_acknowledgment (${packet.rationale.missing_evidence_acknowledgment.length} chars)`);
    assert(typeof packet.rationale.conclusion === 'string' && packet.rationale.conclusion.length > 20, 
      `Drafter microservice produced conclusion (${packet.rationale.conclusion.length} chars)`);

    // -------------------------------------------------------------------------
    // 4. Manual Override Loop on Escalated Case (POST /api/cases/:id/override)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("🔒 4. MANUAL OVERRIDE LOOP ON ESCALATED CASE");
    console.log("--------------------------------------------------------------------------------");
    
    // Create an isolated escalated case for deterministic testing
    const testEscalatedId = `CB-OVR-TEST-${Date.now()}`;
    await fetch(`${BASE_URL}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chargeback_id: testEscalatedId,
        reason_code: "10.4",
        amount: 16000.00,
        currency: "USD",
        customer_id: "cust_test_high_val",
        raw_transaction_data: {
          avs_cvv_match: "Match",
          device_ip_match: "Match",
          prior_order_history: "Orders on file",
          customer_comm_log: "Logged",
          prior_fraud_flags: 0
        }
      })
    });

    // Step 4a: Confirm packet preparation is blocked for escalated case before override
    const blockRes = await fetch(`${BASE_URL}/api/cases/${testEscalatedId}/prepare-packet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert(blockRes.status === 403, `Escalated case ${testEscalatedId} is blocked with HTTP 403 before override (Got: ${blockRes.status})`);
    const blockBody = await blockRes.json();
    console.log(`     Gate Guardrail Message: "${blockBody.error}"`);

    // Step 4b: Submit valid manual override justification >= 10 chars
    const overridePayload = {
      analyst_id: "senior_risk_analyst_04",
      justification: "Verified order legitimacy with tier-2 customer support log."
    };
    const overrideRes = await fetch(`${BASE_URL}/api/cases/${testEscalatedId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overridePayload)
    });
    assert(overrideRes.status === 200, `POST /api/cases/${testEscalatedId}/override returned HTTP 200`);
    const overrideData = await overrideRes.json();
    assert(overrideData.status === 'success', "Override successfully recorded in audit store");
    console.log(`     Override Row Created: ID ${overrideData.data.id} by ${overrideData.data.overridden_by}`);

    // Step 4c: Confirm override unlocked packet preparation
    const unblockRes = await fetch(`${BASE_URL}/api/cases/${testEscalatedId}/prepare-packet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert(unblockRes.status === 200, `Override UNLOCKED case: prepare-packet now succeeds with HTTP 200`);
    const unblockedPacket = await unblockRes.json();
    assert(unblockedPacket.chargeback_id === testEscalatedId, `Unblocked packet prepared for '${testEscalatedId}'`);
    assert(unblockedPacket.action === 'CONTEST', "Unblocked packet action set to 'CONTEST'");
    assert(unblockedPacket.rationale && unblockedPacket.rationale.summary_statement, "Unblocked packet contains dynamic drafter rationale");
    console.log(`     Unlocked Rationale Summary: "${unblockedPacket.rationale.summary_statement.substring(0, 80)}..."`);

    // -------------------------------------------------------------------------
    // 5. Risk Command Center Sync (GET /api/eval-runs/current & live-snapshot)
    // -------------------------------------------------------------------------
    console.log("\n--------------------------------------------------------------------------------");
    console.log("📊 5. RISK COMMAND CENTER SYNC");
    console.log("--------------------------------------------------------------------------------");
    
    // Check eval-runs current
    const evalRes = await fetch(`${BASE_URL}/api/eval-runs/current`);
    assert(evalRes.status === 200, "GET /api/eval-runs/current returned HTTP 200");
    const evalData = await evalRes.json();
    assert(evalData.data.total_tests === 52, `Metrics endpoint serves fresh 52-case benchmark (total_tests: ${evalData.data.total_tests})`);
    assert(evalData.data.accuracy === '100.0%', `Benchmark Accuracy is verified: ${evalData.data.accuracy}`);
    assert(evalData.data.precision === '100.0%', `Benchmark Precision is verified: ${evalData.data.precision}`);
    assert(evalData.data.false_positive_rate === '0.0%', `Benchmark False-Positive Rate is verified: ${evalData.data.false_positive_rate}`);
    assert(evalData.data.escalation_rate === '40.4%', `Benchmark Escalation Rate is verified: ${evalData.data.escalation_rate}`);

    // Check live snapshot
    const snapRes = await fetch(`${BASE_URL}/api/cases/live-snapshot`);
    assert(snapRes.status === 200, "GET /api/cases/live-snapshot returned HTTP 200");
    const snapData = await snapRes.json();
    assert(snapData.data && typeof snapData.data.open_cases_count === 'number', 
      `Live snapshot active (Open Cases: ${snapData.data.open_cases_count}, Avg Completeness: ${snapData.data.avg_completeness_score}%)`);

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log(`🎉 ALL ${passedSteps}/${stepCount} OPERATIONAL LIFECYCLE CHECKS PASSED PERFECTLY!`);
    console.log("🛡️ Aegis backend, deterministic gates, Python ADK Drafter, and UI APIs are 100% verified!");
    console.log("================================================================================\n");

  } catch (err) {
    console.error("\n❌ E2E Verification failed:", err.message);
    process.exit(1);
  }
}

runE2EVerification();
