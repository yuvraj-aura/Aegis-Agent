import { REASON_CODE_CATALOG, GATE_CONFIG } from './config.js';

/**
 * 1. Reason-Code Classifier (PRD §6.1)
 * Exact lookup against schema catalog. Zero fuzzy matching. Zero LLM.
 */
export function classifyReasonCode(rawReasonCode) {
  const codeStr = String(rawReasonCode).trim();
  const schema = REASON_CODE_CATALOG[codeStr];
  if (!schema) {
    return {
      status: "UNKNOWN",
      reason_code: codeStr,
      schema: null
    };
  }
  return {
    status: "MATCHED",
    reason_code: schema.code,
    schema
  };
}

/**
 * 2. Evidence Retriever (PRD §6.2)
 * Pulls ONLY fields defined by the schema for this code.
 * Strict evidence isolation — does NOT leak raw extra data.
 */
export function retrieveEvidence(schema, rawTransactionRecord = {}) {
  if (!schema || !schema.requiredFields) {
    return {
      evidence_used: [],
      missing_evidence: [],
      evidence_object: {}
    };
  }

  const evidence_used = [];
  const missing_evidence = [];
  const evidence_object = {};

  for (const field of schema.requiredFields) {
    const value = rawTransactionRecord[field];
    if (value !== undefined && value !== null && value !== "" && value !== false) {
      evidence_used.push({
        field,
        status: "present",
        source: "merchant_transaction_store",
        value: typeof value === 'object' ? JSON.stringify(value) : String(value)
      });
      evidence_object[field] = value;
    } else {
      evidence_used.push({
        field,
        status: "missing",
        source: "merchant_transaction_store",
        value: null
      });
      missing_evidence.push(field);
      evidence_object[field] = null;
    }
  }

  return {
    evidence_used,
    missing_evidence,
    evidence_object
  };
}

/**
 * 3. Evidence Completeness Scorer (PRD §6.3)
 * Pure arithmetic: present_fields / required_fields
 * Zero LLM involvement. Deterministic and reproducible.
 */
export function scoreEvidenceCompleteness(evidence_used) {
  if (!evidence_used || evidence_used.length === 0) return 0.0;
  const presentCount = evidence_used.filter(e => e.status === "present").length;
  const score = presentCount / evidence_used.length;
  return Number(score.toFixed(2));
}

/**
 * 4. Failsafe Gate (PRD §6.4)
 * Hardcoded deterministic rules.
 * Runs BEFORE the LLM Drafter is ever called.
 */
export function checkFailsafeGate({
  classificationStatus,
  completenessScore,
  amount,
  priorFraudFlags = 0,
  reasonCode
}) {
  // Rule 4: Unknown reason code -> escalate immediately
  if (String(classificationStatus).toUpperCase() === "UNKNOWN") {
    return {
      passed: false,
      rule_triggered: "UNKNOWN_REASON_CODE",
      rule_category: "unrecognized_taxonomy",
      reason: `Reason code '${reasonCode}' not found in canonical taxonomy.`
    };
  }

  // Rule 3: Contradiction check: Merchant logged prior fraud flags >= 2 on customer file
  const fraudLimit = GATE_CONFIG.PRIOR_FRAUD_LIMIT || 2;
  if (priorFraudFlags >= fraudLimit) {
    return {
      passed: false,
      rule_triggered: "PRIOR_FRAUD_CONTRADICTION",
      rule_category: "prior_contradiction",
      reason: `Customer has ${priorFraudFlags} prior fraud flags on file (Limit: ${fraudLimit}). Contradiction detected.`
    };
  }

  // Rule 2: Amount ceiling >= $10,000 -> mandatory human review
  if (amount >= GATE_CONFIG.AMOUNT_CEILING) {
    return {
      passed: false,
      rule_triggered: "HIGH_VALUE_CEILING",
      rule_category: "value_threshold",
      reason: `Transaction amount $${amount} meets/exceeds auto-handling ceiling of $${GATE_CONFIG.AMOUNT_CEILING}.`
    };
  }

  // Rule 1: Completeness score below 75% -> escalate
  if (completenessScore < GATE_CONFIG.COMPLETENESS_THRESHOLD) {
    return {
      passed: false,
      rule_triggered: "INSUFFICIENT_EVIDENCE",
      rule_category: "confidence_floor",
      reason: `Evidence completeness score of ${Math.round(completenessScore * 100)}% is below required ${Math.round(GATE_CONFIG.COMPLETENESS_THRESHOLD * 100)}% threshold.`
    };
  }

  return {
    passed: true,
    rule_triggered: null,
    rule_category: null,
    reason: "Passed all deterministic safety and completeness gates."
  };
}

/**
 * 5. Response Drafter (PRD §6.5 & §8 Anti-hallucination)
 * Receives ONLY the validated evidence object and gate decision.
 */
export function draftRationale({
  gateDecision,
  completenessScore,
  evidence_object,
  missing_evidence,
  reasonCode,
  schema
}) {
  const percentage = Math.round(completenessScore * 100);

  // If gate failed, draft concise explanation of why without arguing case
  if (!gateDecision.passed) {
    if (gateDecision.rule_triggered === "UNKNOWN_REASON_CODE") {
      return `Escalated to human review: Unrecognized reason code '${reasonCode}'. Manual verification required against payment network bulletin.`;
    }
    if (gateDecision.rule_triggered === "PRIOR_FRAUD_CONTRADICTION") {
      return `Escalated to human review: Contradiction rule triggered (${gateDecision.reason}). Evidence completeness is ${percentage}%, but prior customer dispute history mandates analyst adjudication.`;
    }
    if (gateDecision.rule_triggered === "HIGH_VALUE_CEILING") {
      return `Escalated to human review: High-value transaction threshold exceeded (${gateDecision.reason}). Manual review mandatory before submission.`;
    }
    if (gateDecision.rule_triggered === "INSUFFICIENT_EVIDENCE") {
      const missingList = missing_evidence.join(", ");
      return `Evidence completeness is ${percentage}% (below 75% threshold). Missing critical evidence: [${missingList}]. Escalated for human adjudication.`;
    }
    return `Escalated to human review: ${gateDecision.reason}`;
  }

  // Passing CONTEST case: Strictly ground narrative in present evidence fields
  const presentFields = Object.entries(evidence_object)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ");

  let rationale = `Evidence completeness is ${percentage}%. Grounded evidence verified: ${presentFields}.`;
  if (missing_evidence.length > 0) {
    rationale += ` Non-blocking gaps noted: [${missing_evidence.join(", ")}].`;
  }
  rationale += ` Recommended action is CONTEST.`;

  return rationale;
}

/**
 * Full Workflow Runner: Event In -> DisputeResponsePacket Out
 */
export function runAegisWorkflow(disputeEvent) {
  const {
    chargeback_id,
    reason_code,
    amount,
    currency = "USD",
    customer_id,
    raw_transaction_data = {}
  } = disputeEvent;

  // Step 1: Classify
  const classification = classifyReasonCode(reason_code);

  // Step 2: Retrieve Evidence with strict field isolation
  const { evidence_used, missing_evidence, evidence_object } = retrieveEvidence(
    classification.schema,
    raw_transaction_data
  );

  // Step 3: Score Completeness (pure arithmetic)
  const completenessScore = scoreEvidenceCompleteness(evidence_used);

  // Step 4: Check Failsafe Gate
  const priorFraudFlags = raw_transaction_data.prior_fraud_flags || 0;
  const gateDecision = checkFailsafeGate({
    classificationStatus: classification.status,
    completenessScore,
    amount,
    priorFraudFlags,
    reasonCode: reason_code
  });

  // Map to PRD §4.1 cases table schema
  // Determine evidence_status enum ('complete', 'gaps', 'missing')
  let evidence_status = "gaps";
  if (missing_evidence.length === 0 && evidence_used.length > 0) {
    evidence_status = "complete";
  } else if (evidence_used.filter(e => e.status === "present").length === 0) {
    evidence_status = "missing";
  }

  // Determine worklist_action_available enum ('prepare_packet', 'review_gaps', 'escalate_human')
  // SERVER INVARIANT: If gate fails (require_manual_review), MUST be escalate_human
  let worklist_action_available = "escalate_human";
  let gateAction = "require_manual_review";

  if (gateDecision.passed) {
    gateAction = "auto_eligible";
    if (completenessScore >= 0.75) {
      worklist_action_available = "prepare_packet";
    } else {
      worklist_action_available = "review_gaps";
    }
  } else {
    worklist_action_available = "escalate_human";
  }

  // Step 5: Draft Rationale (grounded strictly in validated evidence)
  const rationale = draftRationale({
    gateDecision,
    completenessScore,
    evidence_object,
    missing_evidence,
    reasonCode: reason_code,
    schema: classification.schema
  });

  // Step 6: Assemble standard case record matching PRD §4.1
  const nowIso = new Date().toISOString();
  const caseRecord = {
    id: chargeback_id,
    chargeback_id, // alias for backwards compatibility
    reason_code,
    official_name: classification.schema ? classification.schema.official_name : "Unrecognized Reason Code",
    category: classification.schema ? classification.schema.category : "Unknown",
    amount,
    currency,
    deadline: disputeEvent.dispute_deadline || disputeEvent.deadline || nowIso,
    completeness_score: Math.round(completenessScore * 100), // int 0-100 per PRD §4.1
    confidence: completenessScore, // float 0-1
    evidence_status, // enum('complete', 'gaps', 'missing')
    gate_decision: {
      rule_id: gateDecision.rule_triggered || "NONE",
      rule_category: gateDecision.rule_category || null,
      condition: gateDecision.reason || "All safety checks passed",
      action: gateAction, // enum('auto_eligible', 'require_manual_review')
      evaluated_at: nowIso
    },
    worklist_action_available, // enum('prepare_packet', 'review_gaps', 'escalate_human')
    action: worklist_action_available === 'prepare_packet' ? 'CONTEST' : (worklist_action_available === 'review_gaps' ? 'ACCEPT_LOSS' : 'ESCALATE_TO_HUMAN'),
    evidence_used,
    missing_evidence,
    rationale,
    created_at: nowIso,
    updated_at: nowIso,
    timestamp: nowIso
  };

  return caseRecord;
}
