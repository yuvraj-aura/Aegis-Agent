import { state } from './state.js';
import { api } from './api.js';
import { renderReasonCode, formatCurrency } from './components.js';

let currentCaseDetail = null;
let isManualEditMode = false;
let hasViewedEvidence = false;
let draftPacketState = null;

const EVIDENCE_ICON_MAP = {
    avs_cvv_match: 'verified_user',
    device_ip_match: 'devices',
    prior_order_history: 'receipt_long',
    customer_comm_log: 'chat',
    delivery_tracking: 'local_shipping',
    carrier_delivery_confirmation: 'assignment_turned_in',
    product_listing_snapshot: 'inventory_2',
    delivery_confirmation: 'fact_check',
    return_policy_ack: 'policy',
    cancellation_policy_ack: 'contract_edit',
    billing_history: 'payments',
    transaction_log: 'history'
};

export async function loadCaseDetail(caseId) {
    const container = document.getElementById('case-detail-content');
    if (!container) return;

    container.innerHTML = `
        <div class="py-16 text-center text-gray-500">
            <span class="material-symbols-outlined text-4xl animate-spin text-blue-600 mb-3">progress_activity</span>
            <p class="text-sm font-medium text-gray-700">Loading Case #${caseId} details...</p>
        </div>
    `;

    try {
        const res = await api.fetchCaseDetail(caseId);
        currentCaseDetail = res.data;
        isManualEditMode = false;
        hasViewedEvidence = false;
        renderCaseDetailView();
    } catch (err) {
        console.error("Error loading case detail:", err);
        container.innerHTML = `
            <div class="p-8 bg-rose-50 border border-rose-200 rounded-xl text-center text-rose-700">
                <span class="material-symbols-outlined text-4xl mb-2">error</span>
                <p class="text-sm font-bold">Failed to load Case #${caseId}</p>
                <p class="text-xs text-gray-500 mt-1">${err.message}</p>
                <button onclick="window.aegis.loadCaseDetail('${caseId}')" class="mt-4 px-4 py-1.5 bg-white border border-gray-200 text-xs text-gray-700 font-medium rounded-lg hover:bg-gray-50 shadow-sm">Retry</button>
            </div>
        `;
    }
}

export function renderCaseDetailView() {
    const container = document.getElementById('case-detail-content');
    if (!container || !currentCaseDetail) return;

    const { case: c, reason_code_meta: meta, evidence_items: evidenceList = [], gate_decision: gate, override, submission, outcome } = currentCaseDetail;
    const taxonomyEntry = (state.taxonomy && state.taxonomy[c.reason_code]) || meta;
    const officialName = taxonomyEntry ? taxonomyEntry.official_name : (c.official_name || "Unrecognized Reason Code");

    // §3.1 Primary Header Action Button State
    const isEscalationRequired = c.worklist_action_available === 'escalate_human' && !override;
    let headerActionHtml = "";

    if (submission) {
        headerActionHtml = `
            <span class="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">task_alt</span>
                Submitted to Bank (${new Date(submission.submitted_at).toLocaleDateString()})
            </span>
        `;
    } else if (outcome && outcome.decision === 'accepted_loss') {
        headerActionHtml = `
            <span class="px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200 text-gray-600 text-xs font-semibold flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">cancel</span>
                Dispute Accepted (${new Date(outcome.decided_at).toLocaleDateString()})
            </span>
        `;
    } else if (isEscalationRequired) {
        headerActionHtml = `
            <div class="flex flex-col items-end">
                <button disabled class="h-8 px-4 rounded-lg bg-gray-100 border border-gray-200 text-gray-400 text-xs font-semibold cursor-not-allowed flex items-center gap-1.5 shadow-none" title="This case requires manual review before evidence can be prepared.">
                    <span class="material-symbols-outlined text-[16px]">lock</span>
                    Manual Review Required
                </button>
                <a href="#override-panel" class="text-[11px] text-amber-600 hover:underline mt-1 font-medium">Request approval ↓</a>
            </div>
        `;
    } else {
        headerActionHtml = `
            <button onclick="window.aegis.startPreparePacketFlow('${c.id}')" class="btn-primary h-8 px-4 rounded-lg font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm">
                <span class="material-symbols-outlined text-[16px]">verified</span>
                <span>Compile Evidence</span>
            </button>
        `;
    }

    // §3.2 Circular Progress Ring & Templated Grounding Rationale
    const score = c.completeness_score !== undefined ? c.completeness_score : (c.confidence ? Math.round(c.confidence * 100) : 0);
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    const presentItems = evidenceList.filter(e => e.status === 'present').map(e => e.evidence_type.replace(/_/g, ' '));
    const missingItems = evidenceList.filter(e => e.status === 'missing').map(e => e.evidence_type.replace(/_/g, ' '));

    let templatedRationale = `Evidence completeness is ${score}%. `;
    if (presentItems.length > 0) {
        templatedRationale += `Validated: [${presentItems.join(', ')}]. `;
    }
    if (missingItems.length > 0) {
        templatedRationale += `Unavailable: [${missingItems.join(', ')}]. `;
    } else {
        templatedRationale += `All mandatory evidence fields satisfied. `;
    }
    templatedRationale += isEscalationRequired ? `Manual review required before submission.` : `Ready to compile dispute evidence.`;

    // §3.3 Evidence Status Pill
    const evidenceStatus = (c.evidence_status || (missingItems.length === 0 ? "complete" : "gaps")).toLowerCase();
    let statusPill = "";
    if (evidenceStatus === 'complete') {
        statusPill = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">● Status: Complete</span>`;
    } else if (evidenceStatus === 'missing') {
        statusPill = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">● Status: Missing</span>`;
    } else {
        statusPill = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1">● Status: Gaps</span>`;
    }

    // §3.4 Gate Decision Block (Only render if a rule fired)
    let gateDecisionHtml = "";
    if (gate && gate.rule_id && gate.rule_id !== "NONE") {
        gateDecisionHtml = `
            <div class="bg-amber-50/50 rounded-xl border border-amber-200 p-5 space-y-3">
                <div class="flex items-center gap-2 text-amber-800">
                    <span class="material-symbols-outlined text-[20px]">settings_suggest</span>
                    <h3 class="text-xs font-bold uppercase tracking-wider">Safety Check Rule Triggered</h3>
                </div>
                <div class="bg-white p-3 rounded-lg border border-amber-100 font-mono text-xs text-gray-800 overflow-x-auto shadow-sm">
                    <pre class="text-amber-700">safety_check.rule_triggered = ${JSON.stringify(gate, null, 2)}</pre>
                </div>
            </div>
        `;
    }

    // §3.5 Manual Override Flow Panel
    let manualOverrideHtml = "";
    if (gate && gate.action === 'require_manual_review') {
        if (override) {
            manualOverrideHtml = `
                <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                    <div class="space-y-1">
                        <div class="flex items-center gap-1.5 text-emerald-700 font-bold">
                            <span class="material-symbols-outlined text-[16px]">verified</span>
                            <span>Manual Override Approved</span>
                        </div>
                        <p class="text-gray-600">Reason: "${override.reason}" (Approved by ${override.overridden_by} at ${new Date(override.created_at).toLocaleString()})</p>
                    </div>
                    <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">Unlocked</span>
                </div>
            `;
        } else {
            manualOverrideHtml = `
                <div id="override-panel" class="bg-white rounded-xl border-2 border-amber-200 p-5 space-y-3 shadow-sm">
                    <div class="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                        <span class="material-symbols-outlined text-[18px]">gavel</span>
                        <span>Manager Approval Required</span>
                    </div>
                    <p class="text-xs text-gray-600">
                        This case was flagged for manual review. Preparing dispute evidence requires an explicit confirmation note from an analyst or manager.
                    </p>
                    <div class="space-y-2">
                        <label class="block text-xs font-semibold text-gray-900">Approval Note (minimum 10 characters):</label>
                        <input id="override-reason-input" type="text" placeholder="e.g. Verified customer signed delivery receipt directly with carrier rep..." class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-900 focus:border-blue-600 focus:bg-white" />
                    </div>
                    <div class="flex justify-end pt-1">
                        <button onclick="window.aegis.submitManualOverride('${c.id}')" class="btn-warning px-4 py-2 font-semibold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm">
                            <span class="material-symbols-outlined text-[16px]">lock_open</span>
                            Confirm Approval & Unlock Case
                        </button>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="space-y-6">
            <!-- §3.1 Header -->
            <div class="bg-white rounded-xl border border-gray-200 p-6 flex flex-wrap justify-between items-center gap-4 shadow-sm">
                <div>
                    <div class="flex items-center gap-2">
                        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Case #${c.id}</h1>
                        ${submission ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">SUBMITTED</span>' : ''}
                    </div>
                    <p class="text-xs text-gray-500 mt-1">
                        ${formatCurrency(c.amount, c.currency)} · <span class="font-semibold text-blue-600">${c.reason_code}</span> (${officialName})
                    </p>
                </div>

                <div class="flex items-center gap-3">
                    <button onclick="window.aegis.toggleManualEditMode()" class="btn-secondary h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1.5 shadow-sm">
                        <span class="material-symbols-outlined text-[16px]">${isManualEditMode ? 'check' : 'edit'}</span>
                        <span>${isManualEditMode ? 'Done Editing' : 'Manual Edit'}</span>
                    </button>
                    ${headerActionHtml}
                </div>
            </div>

            <!-- Two Columns: Left = Completeness Score, Right = Evidence Retriever Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                <!-- §3.2 Left Column: Completeness Score Panel -->
                <div class="lg:col-span-4 bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
                    <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">Evidence Completeness</h3>
                    
                    <div class="relative w-32 h-32 flex items-center justify-center my-2">
                        <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="${radius}" stroke="#e2e8f0" stroke-width="8" fill="transparent"/>
                            <circle cx="50" cy="50" r="${radius}" stroke="${score >= 85 ? '#10b981' : (score >= 50 ? '#2563eb' : '#ef4444')}" stroke-width="8" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" fill="transparent" class="transition-all duration-1000"/>
                        </svg>
                        <div class="absolute inset-0 flex flex-col items-center justify-center">
                            <span class="text-3xl font-bold text-gray-900">${score}%</span>
                            <span class="text-[10px] text-gray-400 uppercase font-semibold">Calculated</span>
                        </div>
                    </div>

                    <div class="w-full border-t border-gray-100 pt-3 text-left">
                        <span class="text-[11px] font-semibold text-gray-700 uppercase tracking-wider block mb-1">AI Analysis Summary</span>
                        <p class="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                            "${templatedRationale}"
                        </p>
                    </div>
                </div>

                <!-- §3.3 Right Column: Evidence Retriever Packet Grid -->
                <div id="evidence-section" class="lg:col-span-8 bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <div>
                            <h3 class="text-sm font-semibold text-gray-900">Required Dispute Evidence (${c.reason_code})</h3>
                            <p class="text-[11px] text-gray-500">${evidenceList.length} verified evidence items required by payment network</p>
                        </div>
                        ${statusPill}
                    </div>

                    <!-- Dynamic Evidence Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${evidenceList.map(item => {
                            const icon = EVIDENCE_ICON_MAP[item.evidence_type] || 'description';
                            const isPresent = item.status === 'present';
                            const displayVal = item.analyst_override_value || item.original_value || 'Data Unavailable';
                            const isOverridden = Boolean(item.analyst_override_value);

                            return `
                                <div class="p-3.5 rounded-lg border ${isPresent ? 'bg-gray-50/70 border-gray-200' : 'bg-rose-50/50 border-rose-200'} flex flex-col justify-between space-y-2">
                                    <div class="flex justify-between items-start">
                                        <div class="flex items-center gap-2">
                                            <span class="material-symbols-outlined text-[18px] ${isPresent ? 'text-blue-600' : 'text-rose-600'}">${icon}</span>
                                            <span class="text-xs font-semibold uppercase text-gray-800">${item.evidence_type.replace(/_/g, ' ')}</span>
                                        </div>
                                        <span class="px-2 py-0.5 rounded text-[10px] font-medium ${isPresent ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                                            ${isPresent ? 'Present' : 'Missing'}
                                        </span>
                                    </div>

                                    ${isManualEditMode ? `
                                        <div class="space-y-1 pt-1">
                                            <label class="text-[10px] text-gray-500 block">Analyst Override Value:</label>
                                            <input id="edit-${item.id}" type="text" value="${item.analyst_override_value || item.original_value || ''}" class="w-full bg-white border border-blue-500 rounded p-1.5 text-xs text-gray-900" />
                                            <button onclick="window.aegis.saveEvidenceEdit('${c.id}', '${item.id}')" class="text-[11px] text-blue-600 hover:underline font-medium">Save Edit</button>
                                        </div>
                                    ` : `
                                        <div class="pt-1">
                                            <p class="text-xs text-gray-600 break-words font-mono text-[11px]">${displayVal}</p>
                                            ${isOverridden ? `
                                                <div class="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                                                    <span class="material-symbols-outlined text-[12px]">edit_note</span>
                                                    <span>Edited (Original: "${item.original_value || 'None'}")</span>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>

            <!-- §3.4 Automated Risk & Verification Checks -->
            <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
                <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-600 text-[20px]">analytics</span>
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-900">AI Risk & Verification Checks</h3>
                    </div>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${gate && gate.action === 'auto_eligible' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                        Status: ${gate && gate.action === 'auto_eligible' ? 'Ready for Counter-Proof' : 'Needs Manual Review'}
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <!-- Stage 1 -->
                    <div class="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                        <div class="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1">
                            <span class="material-symbols-outlined text-[13px] text-emerald-600">check_circle</span>
                            1. Reason Code Match
                        </div>
                        <p class="font-semibold text-gray-900">${c.reason_code} · ${officialName}</p>
                        <p class="text-[11px] text-gray-500">Matched network rules</p>
                    </div>

                    <!-- Stage 2 -->
                    <div class="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                        <div class="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1">
                            <span class="material-symbols-outlined text-[13px] text-emerald-600">check_circle</span>
                            2. Data Completeness
                        </div>
                        <p class="font-semibold text-gray-900">${presentItems.length} Present / ${missingItems.length} Missing</p>
                        <p class="text-[11px] text-gray-500">Sensitive data secured</p>
                    </div>

                    <!-- Stage 3 -->
                    <div class="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                        <div class="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1">
                            <span class="material-symbols-outlined text-[13px] ${score >= 75 ? 'text-emerald-600' : 'text-rose-600'}">
                                ${score >= 75 ? 'check_circle' : 'cancel'}
                            </span>
                            3. Evidence Score
                        </div>
                        <p class="font-semibold text-gray-900">${score}% Completeness</p>
                        <p class="text-[11px] text-gray-500">Minimum Target: 75%</p>
                    </div>

                    <!-- Stage 4 -->
                    <div class="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
                        <div class="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1">
                            <span class="material-symbols-outlined text-[13px] ${gate && gate.rule_id === 'NONE' ? 'text-emerald-600' : 'text-amber-600'}">
                                ${gate && gate.rule_id === 'NONE' ? 'check_circle' : 'gavel'}
                            </span>
                            4. Safety Check
                        </div>
                        <p class="font-semibold ${gate && gate.rule_id === 'NONE' ? 'text-emerald-600' : 'text-amber-600'}">
                            ${gate && gate.rule_id ? gate.rule_id : 'PASSED'}
                        </p>
                        <p class="text-[11px] text-gray-500">${gate && gate.rule_triggered ? 'Flagged for manual check' : 'All safety checks passed'}</p>
                    </div>
                </div>

                ${gate && gate.rule_id && gate.rule_id !== "NONE" ? `
                    <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                        <span class="material-symbols-outlined text-[16px] text-amber-600 mt-0.5">warning</span>
                        <div>
                            <span class="font-semibold">Safety Check Alert:</span>
                            <span>${gate.rule_id} — ${gate.rule_id === 'HIGH_VALUE_CEILING' ? 'Transaction amount exceeds automated limit ($10,000.00). Requires manager approval.' : (gate.rule_id === 'PRIOR_FRAUD_CONTRADICTION' ? 'Customer has multiple prior fraud reports on file. Requires analyst check.' : (gate.rule_id === 'INSUFFICIENT_EVIDENCE' ? 'Evidence completeness is below the 75% minimum required.' : 'Unrecognized dispute reason code.'))}</span>
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- §3.5 Manual Override Block -->
            ${manualOverrideHtml}

            <!-- §3.8 Final Decision & Actions Panel -->
            <div class="bg-white rounded-xl border border-gray-200 p-6 flex flex-wrap justify-between items-center gap-4 shadow-sm">
                <div>
                    <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-900">Decision & Next Steps</h4>
                    <p class="text-xs text-gray-500">Final dispute decisions cannot be undone. Please confirm before proceeding.</p>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="window.aegis.handleAcceptLoss('${c.id}', ${c.amount})" class="btn-secondary px-4 py-2 rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 text-xs font-medium cursor-pointer shadow-sm">
                        Accept Dispute (Refund ${formatCurrency(c.amount, c.currency)})
                    </button>
                    <button onclick="window.aegis.startPreparePacketFlow('${c.id}')" ${isEscalationRequired ? 'disabled' : ''} class="px-4 py-2 rounded-lg ${isEscalationRequired ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : 'btn-primary'} text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                        <span class="material-symbols-outlined text-[16px]">verified</span>
                        <span>Compile Evidence</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

export function toggleManualEditMode() {
    isManualEditMode = !isManualEditMode;
    renderCaseDetailView();
}

export async function saveEvidenceEdit(caseId, evidenceId) {
    const input = document.getElementById(`edit-${evidenceId}`);
    if (!input) return;
    const overrideVal = input.value.trim();

    try {
        await api.patchEvidence(caseId, evidenceId, overrideVal);
        await loadCaseDetail(caseId);
    } catch (err) {
        alert("Failed to save evidence edit: " + err.message);
    }
}

export async function submitManualOverride(caseId) {
    const input = document.getElementById('override-reason-input');
    if (!input) return;
    const reason = input.value.trim();

    if (reason.length < 10) {
        alert("Override reason must be at least 10 characters.");
        return;
    }

    try {
        await api.recordOverride(caseId, reason);
        await loadCaseDetail(caseId);
    } catch (err) {
        alert("Failed to record override: " + err.message);
    }
}

export async function handleAcceptLoss(caseId, amount) {
    const confirmed = confirm(`Accept loss of $${amount} for this case? This cannot be undone.`);
    if (!confirmed) return;

    try {
        await api.recordOutcome(caseId, 'accepted_loss');
        await loadCaseDetail(caseId);
    } catch (err) {
        alert("Failed to record loss acceptance: " + err.message);
    }
}

// §3.7 Two-Step Submission Flow Navigation
export async function startPreparePacketFlow(caseId) {
    const container = document.getElementById('case-detail-content');
    if (container) {
        const overlay = document.createElement('div');
        overlay.id = 'drafter-loading-overlay';
        overlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        overlay.innerHTML = `
            <div class="bg-white border border-gray-200 rounded-xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl animate-fadeIn">
                <div class="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 mx-auto flex items-center justify-center">
                    <span class="material-symbols-outlined text-blue-600 text-2xl animate-spin">smart_toy</span>
                </div>
                <div>
                    <h3 class="text-sm font-semibold text-gray-900">Generating AI Dispute Rebuttal</h3>
                    <p class="text-xs text-gray-500 mt-1">Compiling verified evidence and drafting response letter...</p>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-blue-600 h-1.5 rounded-full animate-pulse w-full"></div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    try {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        await sleep(650);
        const res = await api.preparePacket(caseId);
        const overlay = document.getElementById('drafter-loading-overlay');
        if (overlay) overlay.remove();
        
        const packet = (res && res.data) ? res.data : res;
        const caseRecord = currentCaseDetail ? (currentCaseDetail.case || {}) : {};
        const rationale = (packet && packet.rationale) || {};
        
        let draftText = "";
        if (rationale.summary_statement) {
            draftText = `1. SUMMARY STATEMENT:\n${rationale.summary_statement}\n\n2. EVIDENCE NARRATIVE:\n${rationale.evidence_narrative}\n\n3. MISSING EVIDENCE ACKNOWLEDGMENT:\n${rationale.missing_evidence_acknowledgment}\n\n4. CONCLUSION & DISPUTE REMEDY:\n${rationale.conclusion}`;
        } else {
            draftText = typeof rationale === 'string' ? rationale : JSON.stringify(rationale, null, 2);
        }

        draftPacketState = {
            case_id: caseId,
            network: (caseRecord.reason_code && caseRecord.reason_code.startsWith('48')) ? 'Mastercard' : 'Visa',
            amount: caseRecord.amount !== undefined ? caseRecord.amount : (packet.amount || 0),
            currency: caseRecord.currency || packet.currency || 'USD',
            reason_code: caseRecord.reason_code || packet.reason_code || '10.4',
            evidence_items: currentCaseDetail ? (currentCaseDetail.evidence_items || []) : [],
            rationale: rationale,
            draft_packet_text: draftText,
            confidence: packet.confidence !== undefined ? packet.confidence : 1.0,
            action: packet.action || 'CONTEST'
        };

        renderReviewPacketScreen(draftPacketState);
    } catch (err) {
        const overlay = document.getElementById('drafter-loading-overlay');
        if (overlay) overlay.remove();
        alert("Cannot prepare evidence: " + err.message);
    }
}

// §3.7 Step 2: Dedicated Screen for /cases/{id}/review-packet
export function renderReviewPacketScreen(draftData) {
    const container = document.getElementById('case-detail-content');
    if (!container || !draftData) return;

    const r = draftData.rationale || {};

    container.innerHTML = `
        <div class="space-y-6 max-w-4xl mx-auto animate-fadeIn">
            <!-- Header -->
            <div class="flex justify-between items-center border-b border-gray-200 pb-4">
                <div>
                    <span class="text-xs text-blue-600 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[15px]">verified</span>
                        Step 2: Review & Submit Counter-Evidence
                    </span>
                    <h2 class="text-xl font-bold text-gray-900 mt-0.5">Review Dispute Rebuttal Letter</h2>
                </div>
                <button onclick="window.aegis.loadCaseDetail('${draftData.case_id}')" class="btn-secondary px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1 cursor-pointer shadow-sm">
                    <span class="material-symbols-outlined text-[15px]">arrow_back</span>
                    Back to Case Detail
                </button>
            </div>

            <!-- Destination & Case Summary Bar -->
            <div class="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs shadow-sm">
                <div><span class="text-gray-500">Case ID:</span> <div class="font-mono font-semibold text-blue-600">${draftData.case_id}</div></div>
                <div><span class="text-gray-500">Payment Network:</span> <div class="font-semibold text-gray-900">${(draftData.network || 'VISA').toUpperCase()}</div></div>
                <div><span class="text-gray-500">Disputed Amount:</span> <div class="font-semibold text-gray-900">${formatCurrency(draftData.amount, draftData.currency)}</div></div>
                <div><span class="text-gray-500">Reason Code:</span> <div class="font-semibold text-gray-900">${draftData.reason_code}</div></div>
            </div>

            <!-- 4-Part Structured AI Rationale Cards -->
            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px]">smart_toy</span>
                        AI-Generated Dispute Rationale
                    </span>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Verified Merchant Records
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <!-- 1. Summary Statement -->
                    <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5 shadow-sm">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">summarize</span>
                            1. Summary Overview
                        </span>
                        <p class="text-gray-700 leading-relaxed text-[11px]">${r.summary_statement || 'Standard dispute rebuttal prepared.'}</p>
                    </div>

                    <!-- 2. Evidence Narrative -->
                    <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5 shadow-sm">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">fact_check</span>
                            2. Evidence Narrative
                        </span>
                        <p class="text-gray-700 leading-relaxed text-[11px]">${r.evidence_narrative || 'All verified transaction items confirmed.'}</p>
                    </div>

                    <!-- 3. Missing Evidence Acknowledgment -->
                    <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5 shadow-sm">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">rule</span>
                            3. Missing Items Note
                        </span>
                        <p class="text-gray-700 leading-relaxed text-[11px]">${r.missing_evidence_acknowledgment || 'No missing evidence items.'}</p>
                    </div>

                    <!-- 4. Conclusion & Remedy -->
                    <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5 shadow-sm">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">gavel</span>
                            4. Conclusion & Requested Action
                        </span>
                        <p class="text-gray-700 leading-relaxed text-[11px]">${r.conclusion || 'Requesting reversal of disputed funds.'}</p>
                    </div>
                </div>
            </div>

            <!-- Attached Evidence Manifest -->
            <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-2 shadow-sm">
                <span class="text-xs font-semibold uppercase text-gray-900">Attached Proof & Documents</span>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    ${(draftData.evidence_items || []).filter(e => e.status === 'present').map(e => `
                        <div class="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
                            <span class="material-symbols-outlined text-emerald-600 text-[16px]">check_circle</span>
                            <span class="font-semibold text-gray-900">${e.evidence_type.replace(/_/g, ' ')}:</span>
                            <span class="text-gray-600 truncate font-mono text-[11px]">${e.analyst_override_value || e.original_value || 'Verified'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Editable Rebuttal Packet Document -->
            <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-3 shadow-sm">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-semibold uppercase text-gray-900">Official Rebuttal Letter (Sent to Payment Network)</span>
                    <span class="text-[11px] text-gray-500">You can edit this text before final submission</span>
                </div>
                <textarea id="final-packet-text" rows="10" class="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono text-gray-800 leading-relaxed focus:bg-white focus:border-blue-600">${draftData.draft_packet_text}</textarea>
            </div>

            <!-- Final Submission Action Bar -->
            <div class="p-5 bg-gray-50 rounded-xl border border-gray-200 flex flex-wrap justify-between items-center gap-4">
                <div class="flex items-center gap-2 text-xs text-gray-600">
                    <span class="material-symbols-outlined text-emerald-600 text-[20px]">security</span>
                    <span>Submission cannot be undone. Sends directly to ${draftData.network ? draftData.network.toUpperCase() : 'card network'} for review.</span>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="window.aegis.loadCaseDetail('${draftData.case_id}')" class="btn-secondary px-4 py-2 rounded-lg border border-gray-200 text-xs text-gray-700 hover:text-gray-900 shadow-sm">
                        Back to Case
                    </button>
                    <button onclick="window.aegis.executeFinalSubmission('${draftData.case_id}')" class="btn-primary px-5 py-2 rounded-lg font-semibold text-xs flex items-center gap-2 shadow-sm">
                        <span class="material-symbols-outlined text-[18px]">send</span>
                        Submit Counter-Proof to Network
                    </button>
                </div>
            </div>
        </div>
    `;
}

export async function executeFinalSubmission(caseId) {
    const textarea = document.getElementById('final-packet-text');
    const packetText = textarea ? textarea.value : "";

    try {
        await api.submitPacket(caseId, packetText);
        alert(`Dispute counter-evidence for Case #${caseId} has been submitted.`);
        await loadCaseDetail(caseId);
    } catch (err) {
        alert("Submission failed: " + err.message);
    }
}
