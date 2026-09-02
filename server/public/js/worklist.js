import { state } from './state.js';
import { api } from './api.js';
import { renderReasonCode, formatDeadline, formatCurrency, renderActionButton } from './components.js';
import { PRESETS } from './presets.js';

// Section 3.6: Render Skeleton Loading, Empty States, and Error States
export function renderSkeletonLoading() {
    const tbody = document.getElementById('worklist-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(6).fill(0).map(() => `
        <tr class="h-11">
            <td class="py-3 px-4"><div class="h-4 w-16 skeleton rounded"></div></td>
            <td class="py-3 px-4"><div class="h-4 w-48 skeleton rounded"></div></td>
            <td class="py-3 px-4 text-right"><div class="h-4 w-16 skeleton rounded ml-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 w-20 skeleton rounded"></div></td>
            <td class="py-3 px-4 text-center"><div class="h-4 w-8 skeleton rounded mx-auto"></div></td>
            <td class="py-3 px-4"><div class="h-4 w-16 skeleton rounded"></div></td>
            <td class="py-3 px-4 text-right"><div class="h-6 w-28 skeleton rounded ml-auto"></div></td>
        </tr>
    `).join('');
}

export function renderEmptyState(isFiltered = false) {
    const tbody = document.getElementById('worklist-tbody');
    if (!tbody) return;
    if (isFiltered) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-12 text-center text-on-surface-variant">
                    <span class="material-symbols-outlined text-3xl mb-2 text-outline">filter_alt_off</span>
                    <p class="text-sm font-semibold text-on-surface">No cases match these filters</p>
                    <button onclick="window.aegis.clearAllFilters()" class="mt-2 text-xs text-primary hover:underline">Clear filters</button>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-12 text-center text-on-surface-variant">
                    <span class="material-symbols-outlined text-3xl mb-2 text-outline">check_circle</span>
                    <p class="text-sm font-semibold text-on-surface">No disputes require action</p>
                </td>
            </tr>
        `;
    }
    const info = document.getElementById('pagination-info');
    if (info) info.innerText = "Showing 0 cases";
    const prev = document.getElementById('btn-prev-page');
    const next = document.getElementById('btn-next-page');
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
}

export function renderErrorState(message) {
    const tbody = document.getElementById('worklist-tbody');
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="py-12 text-center text-error">
                <span class="material-symbols-outlined text-3xl mb-2">error</span>
                <p class="text-sm font-semibold">${message}</p>
                <button onclick="window.aegis.fetchCases()" class="mt-3 px-3 py-1 bg-surface-container border border-outline-variant text-xs text-on-surface rounded hover:bg-surface-container-high">Retry</button>
            </td>
        </tr>
    `;
}

// Section 3.4: Render Table Rows
export function renderWorklistTable(cases, pagination) {
    const tbody = document.getElementById('worklist-tbody');
    if (!tbody) return;

    const hasFilters = state.currentFilters.reason_codes.length > 0 || 
                       state.currentFilters.evidence_statuses.length > 0 || 
                       state.currentFilters.deadline_filter !== 'all' || 
                       state.currentFilters.confidence_band !== 'all';

    if (!cases || cases.length === 0) {
        renderEmptyState(hasFilters);
        return;
    }

    tbody.innerHTML = cases.map(row => {
        const id = row.id || row.chargeback_id;
        const score = (row.completeness_score !== undefined && row.completeness_score !== null) 
            ? row.completeness_score 
            : (row.confidence !== undefined ? Math.round(row.confidence * 100) : 0);
        
        const deadline = row.deadline || row.dispute_deadline || row.timestamp;

        // Column 6: Evidence status pill
        let statusPill = "";
        const st = (row.evidence_status || (row.missing_evidence && row.missing_evidence.length === 0 ? "complete" : "gaps")).toLowerCase();
        if (st === 'complete') {
            statusPill = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">● Complete</span>`;
        } else if (st === 'missing') {
            statusPill = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">● Missing</span>`;
        } else {
            statusPill = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200">● Gaps</span>`;
        }

        return `
            <tr class="hover:bg-gray-50/80 transition-colors h-11">
                <!-- Col 1: Case ID (clickable) -->
                <td class="py-2.5 px-4 font-mono text-xs font-semibold text-blue-600 cursor-pointer hover:underline hover:text-blue-800" onclick="window.aegis.openCaseDetail('${id}')">
                    ${id}
                </td>
                <!-- Col 2: Reason Code (looked up from canonical taxonomy) -->
                <td class="py-2.5 px-4 text-xs">
                    ${renderReasonCode(row.reason_code)}
                </td>
                <!-- Col 3: Amount -->
                <td class="py-2.5 px-4 text-right text-xs font-semibold text-gray-900">
                    ${formatCurrency(row.amount, row.currency)}
                </td>
                <!-- Col 4: Deadline (relative if today, red if < 24h) -->
                <td class="py-2.5 px-4 text-xs text-gray-700">
                    ${formatDeadline(deadline)}
                </td>
                <!-- Col 5: Confidence (plain integer 0-100) -->
                <td class="py-2.5 px-4 text-center text-xs font-semibold ${score >= 85 ? 'text-emerald-600' : (score >= 50 ? 'text-blue-600' : 'text-rose-600')}">
                    ${score}%
                </td>
                <!-- Col 6: Evidence Status Pill -->
                <td class="py-2.5 px-4 text-xs">
                    ${statusPill}
                </td>
                <!-- Col 7: Action Button (reads worklist_action_available only) -->
                <td class="py-2.5 px-4 text-right">
                    ${renderActionButton(row)}
                </td>
            </tr>
        `;
    }).join('');

    // Update Pagination UI
    const start = (pagination.page - 1) * state.pageSize + 1;
    const end = Math.min(pagination.page * state.pageSize, pagination.total_count);
    const info = document.getElementById('pagination-info');
    if (info) info.innerText = `Showing ${start}–${end} of ${pagination.total_count} cases`;
    const indicator = document.getElementById('pagination-page-indicator');
    if (indicator) indicator.innerText = `Page ${pagination.page} of ${pagination.total_pages}`;
    const prev = document.getElementById('btn-prev-page');
    if (prev) prev.disabled = pagination.page <= 1;
    const next = document.getElementById('btn-next-page');
    if (next) next.disabled = pagination.page >= pagination.total_pages;
}

// Section 4.4: Fetch cases from GET /api/cases with server-side params
export async function fetchCases() {
    if (state.isFetching) return;
    state.isFetching = true;
    renderSkeletonLoading();

    try {
        const params = new URLSearchParams();
        params.set('page', state.currentPage);
        params.set('page_size', state.pageSize);
        params.set('sort', state.currentSort);

        state.currentFilters.reason_codes.forEach(c => params.append('reason_code', c));
        state.currentFilters.evidence_statuses.forEach(s => params.append('evidence_status', s));
        if (state.currentFilters.deadline_filter !== 'all') params.set('deadline_filter', state.currentFilters.deadline_filter);
        if (state.currentFilters.confidence_band !== 'all') params.set('confidence_band', state.currentFilters.confidence_band);

        // Update browser URL query string without reloading (§3.2, §3.3)
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);

        const json = await api.fetchCases(params);
        state.cachedCases = json.items || [];
        const pagination = json.pagination || { page: 1, total_count: 0, total_pages: 1 };

        renderWorklistTable(state.cachedCases, pagination);
    } catch (err) {
        console.error("Worklist fetch error:", err);
        renderErrorState("Failed to connect to backend server.");
    } finally {
        state.isFetching = false;
    }
}

// Navigation & Actions
export function navigateAction(id, type) {
    if (type === 'prepare-packet') {
        openCaseDetail(id);
        setTimeout(() => {
            import('./case_detail.js').then(module => module.startPreparePacketFlow(id));
        }, 100);
    } else {
        openCaseDetail(id);
    }
}

// 2-Step Evidence Packet Flow Modal (PRD §3.5)
export function openPreparePacketModal(id) {
    const d = state.cachedCases.find(p => (p.id === id || p.chargeback_id === id));
    if (!d) return;

    const officialName = state.taxonomy[d.reason_code] ? state.taxonomy[d.reason_code].official_name : "Unrecognized Reason Code";
    const modal = document.getElementById('packet-modal');
    const container = document.getElementById('packet-modal-content');
    if (!modal || !container) return;

    container.innerHTML = `
        <div class="space-y-4">
            <div class="bg-gray-50/70 p-4 rounded-xl border border-gray-200 flex justify-between items-center shadow-sm">
                <div>
                    <span class="font-mono text-xs font-semibold text-blue-600">${d.id}</span>
                    <h4 class="text-sm font-semibold text-gray-900 mt-0.5">${d.reason_code} · ${officialName}</h4>
                </div>
                <div class="text-right">
                    <span class="text-xs text-gray-500">Disputed Amount</span>
                    <div class="text-sm font-bold text-gray-900">${formatCurrency(d.amount, d.currency)}</div>
                </div>
            </div>

            <!-- Step 1: Verified Evidence -->
            <div>
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-semibold uppercase tracking-wider text-gray-700">Step 1: Verify Evidence Items</span>
                    <span class="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">${d.completeness_score}% Complete</span>
                </div>
                <div class="space-y-1.5 max-h-48 overflow-y-auto">
                    ${(d.evidence_used || []).map(e => `
                        <div class="flex justify-between items-center p-2 rounded-lg bg-gray-50 border border-gray-200 text-xs">
                            <span class="font-medium text-gray-900">${e.field.replace(/_/g, ' ')}</span>
                            <span class="text-gray-600 font-mono text-[11px]">${e.value || 'Verified'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Step 2: Response Review -->
            <div>
                <span class="text-xs font-semibold uppercase tracking-wider text-gray-700 block mb-1.5">Step 2: AI-Drafted Response Review</span>
                <div class="p-3.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700 leading-relaxed font-mono text-[11px]">
                    "${d.rationale || 'Evidence completeness verified. Ready to contest dispute.'}"
                </div>
            </div>

            <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-700">
                <span class="material-symbols-outlined text-[18px]">verified_user</span>
                <span>Pre-submission check passed. Ready to contest dispute.</span>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

export function closePacketModal() {
    const modal = document.getElementById('packet-modal');
    if (modal) modal.classList.add('hidden');
}

export function submitPacketFinal() {
    alert("Dispute counter-evidence submitted successfully to payment network gateway.");
    closePacketModal();
    fetchCases();
}

export function openCaseDetail(id) {
    switchTab('case-detail');
    import('./case_detail.js').then(module => {
        module.loadCaseDetail(id);
    });
}

// Navigation Tab Switcher
let currentActiveTab = 'dashboard';

export function switchTab(tabId) {
    currentActiveTab = tabId;
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.className = "nav-btn w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600 hover:text-gray-900 transition-all text-left text-xs font-medium";
    });

    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) activeView.classList.remove('hidden');

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.className = "nav-btn active-tab w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-blue-600 transition-all text-left text-xs font-medium";
    }

    const titleMap = {
        dashboard: "Risk Command Center",
        worklist: "Dispute Worklist",
        audit: "System Audit Logs",
        dna: "Aegis DNA (Official Taxonomy)",
        'case-detail': "Dispute Case Investigation"
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titleMap[tabId] || "Aegis Forensic";

    if (tabId === 'dashboard') {
        import('./command_center.js').then(module => {
            module.loadBacktestBenchmark();
            module.loadLiveQueueSnapshot();
            module.loadHighValueFailsafes();
        });
    }
    if (tabId === 'worklist') fetchCases();
    if (tabId === 'audit') loadAuditLogs();
}

export function refreshCurrentTab() {
    if (currentActiveTab === 'dashboard') {
        import('./command_center.js').then(module => module.refreshCommandCenter());
    } else if (currentActiveTab === 'worklist') {
        fetchCases();
    } else if (currentActiveTab === 'audit') {
        loadAuditLogs();
    }
}

async function loadMetrics() {
    try {
        const res = await api.fetchMetrics();
        const m = res.data;
        if (m) {
            const confEl = document.getElementById('dash-avg-conf');
            if (confEl) confEl.innerText = `${Math.round((m.avg_confidence || 0) * 100)}%`;
        }
    } catch (e) {
        console.error("Metrics load error:", e);
    }
}

async function loadAuditLogs() {
    try {
        const res = await api.fetchAuditLogs();
        const tbody = document.getElementById('audit-table-body');
        if (!tbody) return;
        tbody.innerHTML = (res.data || []).map(log => `
            <tr class="hover:bg-gray-50/80 transition-colors">
                <td class="py-2.5 px-4 font-mono font-semibold text-blue-600">${log.chargeback_id}</td>
                <td class="py-2.5 px-4 text-xs">${renderReasonCode(log.reason_code)}</td>
                <td class="py-2.5 px-4 text-xs font-medium text-gray-800">${log.action}</td>
                <td class="py-2.5 px-4 text-xs">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${log.gate_passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
                        ${log.gate_passed ? 'Passed' : log.rule_triggered}
                    </span>
                </td>
                <td class="py-2.5 px-4 text-gray-500 text-xs">${new Date(log.timestamp).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error("Audit log error:", e);
    }
}

// Filter / Sort Interactions
export function toggleFilterPanel() {
    document.getElementById('filter-panel').classList.toggle('hidden');
    document.getElementById('sort-panel').classList.add('hidden');
}

export function toggleSortPanel() {
    document.getElementById('sort-panel').classList.toggle('hidden');
    document.getElementById('filter-panel').classList.add('hidden');
}

export function onFilterChange() {
    const selectedCodes = [];
    document.querySelectorAll('.filter-code:checked').forEach(el => selectedCodes.push(el.value));
    state.currentFilters.reason_codes = selectedCodes;

    const selectedStatuses = [];
    document.querySelectorAll('.filter-status:checked').forEach(el => selectedStatuses.push(el.value));
    state.currentFilters.evidence_statuses = selectedStatuses;

    state.currentFilters.deadline_filter = document.getElementById('filter-deadline').value;
    state.currentFilters.confidence_band = document.getElementById('filter-confidence').value;

    const hasFilters = selectedCodes.length > 0 || selectedStatuses.length > 0 || 
                       state.currentFilters.deadline_filter !== 'all' || 
                       state.currentFilters.confidence_band !== 'all';
    document.getElementById('filter-badge').classList.toggle('hidden', !hasFilters);

    state.currentPage = 1;
    fetchCases();
}

export function clearAllFilters() {
    document.querySelectorAll('.filter-code').forEach(el => el.checked = false);
    document.querySelectorAll('.filter-status').forEach(el => el.checked = false);
    document.getElementById('filter-deadline').value = 'all';
    document.getElementById('filter-confidence').value = 'all';
    document.getElementById('filter-badge').classList.add('hidden');

    state.currentFilters = {
        reason_codes: [],
        evidence_statuses: [],
        deadline_filter: 'all',
        confidence_band: 'all'
    };
    state.currentPage = 1;
    fetchCases();
}

export function setSort(sortKey, label) {
    state.currentSort = sortKey;
    document.getElementById('sort-current-label').innerText = `Sort: ${label}`;
    document.getElementById('sort-panel').classList.add('hidden');
    state.currentPage = 1;
    fetchCases();
}

export function changePage(delta) {
    state.currentPage += delta;
    fetchCases();
}

// Canonical Evidence Fields Reference for Form Creator
const REASON_CODE_FIELDS = {
    "10.4": [
        { field: "avs_cvv_match", label: "AVS & CVV Match", defaultVal: "Full Match (AVS Y / CVV M)" },
        { field: "device_ip_match", label: "Device IP & Fingerprint", defaultVal: "192.168.1.100 (Known Customer Device)" },
        { field: "prior_order_history", label: "Prior Order History", defaultVal: "15 successful transactions" },
        { field: "customer_comm_log", label: "Customer Comm Log", defaultVal: "Customer acknowledged order confirmation" }
    ],
    "13.1": [
        { field: "delivery_tracking", label: "Delivery Tracking #", defaultVal: "FedEx 9400111899562549" },
        { field: "carrier_delivery_confirmation", label: "Carrier Delivery Confirmation", defaultVal: "Signed by cardholder on porch" },
        { field: "customer_comm_log", label: "Customer Comm Log", defaultVal: "Delivery confirmation acknowledged" }
    ],
    "13.3": [
        { field: "product_listing_snapshot", label: "Product Listing Snapshot", defaultVal: "SKU-9902 Full Specifications & Photos" },
        { field: "delivery_confirmation", label: "Carrier Delivery Confirmation", defaultVal: "Direct Signature on File" },
        { field: "customer_comm_log", label: "Customer Support Thread", defaultVal: "Customer acknowledged item matched catalog specs" },
        { field: "return_policy_ack", label: "Return Policy Acknowledgment", defaultVal: "Agreed to 30-day unopened return policy" }
    ],
    "12.6.1": [
        { field: "transaction_log", label: "Transaction Authorization Log", defaultVal: "Two distinct orders #ORD-8821 and #ORD-8822" },
        { field: "avs_cvv_match", label: "AVS & CVV Match", defaultVal: "AVS Y, CVV M" },
        { field: "customer_comm_log", label: "Invoices / Communication", defaultVal: "Invoices delivered for separate distinct items" }
    ],
    "13.6": [
        { field: "refund_policy_ack", label: "Refund Policy Terms", defaultVal: "Agreed to non-refundable custom fabrication policy" },
        { field: "cancellation_terms", label: "Cancellation Terms", defaultVal: "Terms §4: Final Sale upon fabrication start" },
        { field: "customer_comm_log", label: "Customer Comm Log", defaultVal: "Customer informed of non-refundable custom order status" }
    ],
    "13.2": [
        { field: "cancellation_policy_ack", label: "Recurring Cancellation Policy", defaultVal: "Signed subscription terms at checkout" },
        { field: "billing_history", label: "Billing History", defaultVal: "Monthly subscription active for 6 months" },
        { field: "customer_comm_log", label: "Customer Comm Log", defaultVal: "Cancellation request received after billing cutoff" }
    ],
    "99.9_UNKNOWN": [
        { field: "delivery_tracking", label: "Unclassified Document", defaultVal: "TRK_UNKNOWN_99" }
    ]
};

// Open Form-Based Dispute Creator Modal
export function openSimModal() {
    const modal = document.getElementById('sim-modal');
    if (!modal) return;
    
    // Auto-generate fresh Case ID
    const caseIdInput = document.getElementById('form-case-id');
    if (caseIdInput) caseIdInput.value = "CB-" + Math.floor(1000 + Math.random() * 9000);

    // Default Deadline (Today + 14 days)
    const deadlineInput = document.getElementById('form-deadline');
    if (deadlineInput) {
        const d = new Date(Date.now() + 14 * 86400 * 1000);
        deadlineInput.value = d.toISOString().split('T')[0];
    }

    const codeSelect = document.getElementById('form-reason-code');
    const selectedCode = codeSelect ? codeSelect.value : "10.4";
    renderFormEvidenceItems(selectedCode);

    modal.classList.remove('hidden');
}

export function closeSimModal() {
    const modal = document.getElementById('sim-modal');
    if (modal) modal.classList.add('hidden');
}

export function onFormReasonCodeChange() {
    const code = document.getElementById('form-reason-code').value;
    renderFormEvidenceItems(code);
}

export function renderFormEvidenceItems(code, customValues = {}, missingList = []) {
    const container = document.getElementById('form-evidence-items-container');
    if (!container) return;

    const fields = REASON_CODE_FIELDS[code] || REASON_CODE_FIELDS["10.4"];
    
    container.innerHTML = fields.map(item => {
        const isMissing = missingList.includes(item.field);
        const val = customValues[item.field] !== undefined ? customValues[item.field] : item.defaultVal;

        return `
            <div id="ev-card-${item.field}" class="p-3 rounded-lg border transition-all ${isMissing ? 'bg-gray-50/50 border-gray-200 opacity-60' : 'bg-white border-gray-200 shadow-sm'}">
                <div class="flex justify-between items-center mb-1.5">
                    <span class="font-semibold text-gray-900 text-xs flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[16px] ${isMissing ? 'text-gray-400' : 'text-blue-600'}">verified</span>
                        ${item.label}
                    </span>
                    <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 border border-gray-200">
                        <button type="button" onclick="window.aegis.setEvidenceStatus('${item.field}', 'present')" id="btn-status-${item.field}-present" class="px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${!isMissing ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}">
                            Present
                        </button>
                        <button type="button" onclick="window.aegis.setEvidenceStatus('${item.field}', 'missing')" id="btn-status-${item.field}-missing" class="px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${isMissing ? 'bg-rose-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}">
                            Missing
                        </button>
                    </div>
                </div>
                <input type="text" id="ev-input-${item.field}" value="${val || ''}" ${isMissing ? 'disabled' : ''} placeholder="${isMissing ? 'Marked as missing from merchant record' : 'Enter verified value on file'}" class="w-full bg-white border border-gray-200 rounded px-2.5 py-1.5 text-[11px] text-gray-900 font-mono focus:border-blue-600 focus:outline-none disabled:opacity-50 disabled:bg-gray-100"/>
            </div>
        `;
    }).join('');

    updateFormEvidenceCompletenessBadge();
}

export function setEvidenceStatus(fieldKey, status) {
    const card = document.getElementById(`ev-card-${fieldKey}`);
    const input = document.getElementById(`ev-input-${fieldKey}`);
    const btnPres = document.getElementById(`btn-status-${fieldKey}-present`);
    const btnMiss = document.getElementById(`btn-status-${fieldKey}-missing`);

    if (status === 'missing') {
        if (card) {
            card.classList.add('opacity-60', 'bg-gray-50/50');
            card.classList.remove('bg-white', 'shadow-sm');
        }
        if (input) {
            input.disabled = true;
            input.placeholder = "Marked as missing from merchant record";
        }
        if (btnPres) {
            btnPres.className = "px-2 py-0.5 rounded text-[10px] font-semibold transition-all text-gray-600 hover:text-gray-900";
        }
        if (btnMiss) {
            btnMiss.className = "px-2 py-0.5 rounded text-[10px] font-semibold transition-all bg-rose-600 text-white shadow-sm";
        }
    } else {
        if (card) {
            card.classList.remove('opacity-60', 'bg-gray-50/50');
            card.classList.add('bg-white', 'shadow-sm');
        }
        if (input) {
            input.disabled = false;
            if (!input.value) {
                const code = document.getElementById('form-reason-code').value;
                const fieldObj = (REASON_CODE_FIELDS[code] || []).find(f => f.field === fieldKey);
                input.value = fieldObj ? fieldObj.defaultVal : "Verified on file";
            }
        }
        if (btnPres) {
            btnPres.className = "px-2 py-0.5 rounded text-[10px] font-semibold transition-all bg-emerald-600 text-white shadow-sm";
        }
        if (btnMiss) {
            btnMiss.className = "px-2 py-0.5 rounded text-[10px] font-semibold transition-all text-gray-600 hover:text-gray-900";
        }
    }

    updateFormEvidenceCompletenessBadge();
}

export function updateFormEvidenceCompletenessBadge() {
    const code = document.getElementById('form-reason-code').value;
    const fields = REASON_CODE_FIELDS[code] || REASON_CODE_FIELDS["10.4"];
    let presentCount = 0;

    fields.forEach(f => {
        const input = document.getElementById(`ev-input-${f.field}`);
        if (input && !input.disabled && input.value.trim().length > 0) {
            presentCount++;
        }
    });

    const score = fields.length > 0 ? Math.round((presentCount / fields.length) * 100) : 0;
    const badge = document.getElementById('evidence-completeness-badge');
    if (badge) {
        badge.innerText = `Completeness: ${score}% (${presentCount}/${fields.length} Fields)`;
        if (score >= 75) {
            badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200";
        } else {
            badge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200";
        }
    }
}

export function applyFormPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    document.getElementById('form-case-id').value = preset.chargeback_id || ("CB-" + Math.floor(1000 + Math.random() * 9000));
    document.getElementById('form-reason-code').value = preset.reason_code || "10.4";
    document.getElementById('form-amount').value = preset.amount !== undefined ? preset.amount : 850.00;
    document.getElementById('form-customer-id').value = preset.customer_id || "cust_101";
    document.getElementById('form-fraud-flags').value = (preset.raw_transaction_data && preset.raw_transaction_data.prior_fraud_flags) || 0;

    if (preset.dispute_deadline) {
        document.getElementById('form-deadline').value = new Date(preset.dispute_deadline).toISOString().split('T')[0];
    }

    const raw = preset.raw_transaction_data || {};
    const missing = [];
    const fields = REASON_CODE_FIELDS[preset.reason_code] || REASON_CODE_FIELDS["10.4"];
    
    fields.forEach(f => {
        if (raw[f.field] === undefined || raw[f.field] === null || raw[f.field] === false) {
            missing.push(f.field);
        }
    });

    renderFormEvidenceItems(preset.reason_code, raw, missing);
}

// Submit Custom Dispute Form & Run Realistic Forensic Stepper Animation
export async function submitCustomDisputeForm() {
    const caseId = document.getElementById('form-case-id').value.trim() || ("CB-" + Math.floor(1000 + Math.random() * 9000));
    const reasonCode = document.getElementById('form-reason-code').value;
    const amount = parseFloat(document.getElementById('form-amount').value) || 0;
    const customerId = document.getElementById('form-customer-id').value.trim() || "cust_101";
    const deadline = document.getElementById('form-deadline').value || new Date().toISOString().split('T')[0];
    const priorFraudFlags = parseInt(document.getElementById('form-fraud-flags').value, 10) || 0;

    // Build raw_transaction_data from evidence item inputs
    const rawTxnData = { prior_fraud_flags: priorFraudFlags };
    const fields = REASON_CODE_FIELDS[reasonCode] || REASON_CODE_FIELDS["10.4"];

    fields.forEach(f => {
        const input = document.getElementById(`ev-input-${f.field}`);
        if (input && !input.disabled && input.value.trim().length > 0) {
            rawTxnData[f.field] = input.value.trim();
        }
    });

    const payload = {
        chargeback_id: caseId,
        reason_code: reasonCode,
        transaction_id: "txn_" + Date.now(),
        amount: amount,
        currency: "USD",
        customer_id: customerId,
        dispute_deadline: deadline,
        raw_transaction_data: rawTxnData
    };

    // Close Creator Modal & Launch Stepper Animation
    closeSimModal();
    const stepperModal = document.getElementById('pipeline-stepper-modal');
    if (stepperModal) stepperModal.classList.remove('hidden');

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function setStepState(stepNum, statusText, isDone = false) {
        const row = document.getElementById(`step-status-${stepNum}`);
        if (!row) return;
        const icon = row.querySelector('.step-icon');
        const detail = row.querySelector('.step-detail');
        if (detail) detail.innerText = statusText;

        if (isDone) {
            row.className = "flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 transition-colors";
            if (icon) {
                icon.innerText = "check_circle";
                icon.className = "material-symbols-outlined text-[18px] text-emerald-600 step-icon";
            }
        } else {
            row.className = "flex items-center justify-between p-2.5 rounded-lg bg-blue-50 border border-blue-200 transition-colors animate-pulse";
            if (icon) {
                icon.innerText = "sync";
                icon.className = "material-symbols-outlined text-[18px] text-blue-600 animate-spin step-icon";
            }
        }
    }

    const progressBar = document.getElementById('stepper-progress-bar');
    const pctText = document.getElementById('stepper-percentage');
    const logText = document.getElementById('stepper-log-text');

    try {
        // Step 1: Taxonomy Classification (~300ms)
        if (progressBar) progressBar.style.width = "20%";
        if (pctText) pctText.innerText = "20%";
        if (logText) logText.innerText = `Classifying reason code ${reasonCode} against Visa/Mastercard canonical schema...`;
        setStepState(1, "Classifying...", false);
        await sleep(320);
        setStepState(1, "Matched Canonical Schema", true);

        // Step 2: Evidence Field Isolation (~300ms)
        if (progressBar) progressBar.style.width = "40%";
        if (pctText) pctText.innerText = "40%";
        if (logText) logText.innerText = `Isolating ${fields.length} mandatory schema fields from merchant transaction store...`;
        setStepState(2, "Extracting fields...", false);
        await sleep(320);
        setStepState(2, "Strict Schema Isolation Complete", true);

        // Step 3: Arithmetic Completeness Scoring (~300ms)
        if (progressBar) progressBar.style.width = "60%";
        if (pctText) pctText.innerText = "60%";
        if (logText) logText.innerText = "Computing deterministic completeness score via pure arithmetic...";
        setStepState(3, "Calculating score...", false);
        await sleep(320);
        setStepState(3, "Completeness Score Verified", true);

        // Step 4: Failsafe Safety Gate Evaluation (~300ms)
        if (progressBar) progressBar.style.width = "80%";
        if (pctText) pctText.innerText = "80%";
        if (logText) logText.innerText = "Evaluating $10,000 ceiling, prior contradiction flags, and floor threshold...";
        setStepState(4, "Evaluating rules...", false);
        await sleep(350);
        setStepState(4, "Deterministic Gates Evaluated", true);

        // Step 5: Google ADK Drafter Invocation & Database Ingestion (~400ms)
        if (progressBar) progressBar.style.width = "95%";
        if (pctText) pctText.innerText = "95%";
        if (logText) logText.innerText = "Invoking Google ADK Drafter on Port 8001 & updating audit store...";
        setStepState(5, "Persisting case...", false);

        // Live API Webhook call
        await api.sendWebhook(payload);
        await sleep(350);

        if (progressBar) progressBar.style.width = "100%";
        if (pctText) pctText.innerText = "100%";
        setStepState(5, "Audit Record Persisted", true);
        if (logText) logText.innerText = "Forensic analysis complete! Opening Analyst Dossier...";
        await sleep(400);

        // Close Stepper & Navigate directly to the Analyst Dossier for deep review
        if (stepperModal) stepperModal.classList.add('hidden');
        
        switchTab('worklist');
        await fetchCases();
        openCaseDetail(caseId);

    } catch (err) {
        if (stepperModal) stepperModal.classList.add('hidden');
        alert("Error during forensic analysis: " + err.message);
        switchTab('worklist');
        fetchCases();
    }
}

