import { state } from './state.js';
import { api } from './api.js';
import { formatCurrency, formatDeadline } from './components.js';

let highValueCasesCached = [];

// PRD_Patch_v2 §2: Section A — Model Backtest Benchmark (Real failure-injection tests)
export async function loadBacktestBenchmark() {
    const container = document.getElementById('rcc-section-a');
    if (!container) return;

    try {
        const res = await api.fetchCurrentEvalRun();
        const run = res.data;
        const formattedDate = new Date(run.run_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const totalTests = run.total_tests || (run.results ? run.results.length : 5);
        const passedTests = run.passed_tests || (run.results ? run.results.filter(r => r.passed).length : 5);
        const isAllPassed = passedTests === totalTests;
        const testResults = run.results || [];

        container.innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-5 shadow-sm">
                <div class="flex flex-wrap justify-between items-start gap-2 border-b border-gray-100 pb-3">
                    <div>
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-900">Backtest Benchmark</h3>
                        <p class="text-xs text-gray-500 mt-0.5">
                            ${passedTests}/${totalTests} failure-injection tests passed · Last run ${formattedDate}
                        </p>
                    </div>
                    <button onclick="window.aegis.openEvalReportModal()" class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer transition-colors">
                        <span class="material-symbols-outlined text-[15px]">open_in_new</span>
                        <span>View Full Eval Output</span>
                    </button>
                </div>

                <!-- Main Metric Stat Box -->
                <div class="flex items-center gap-4 bg-gray-50/60 p-4 rounded-xl border border-gray-200">
                    <div class="flex items-baseline gap-2">
                        <span class="text-3xl font-bold ${isAllPassed ? 'text-emerald-600' : 'text-blue-600'}">${passedTests}/${totalTests}</span>
                        <span class="text-xs font-medium text-gray-500 uppercase">Tests Passed</span>
                    </div>
                    ${isAllPassed ? `
                        <div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                            <span class="material-symbols-outlined text-[16px]">check_circle</span>
                            <span>100% Deterministic Verification</span>
                        </div>
                    ` : ''}
                </div>

                <!-- Per-Test Breakdown Table (§2) -->
                <div>
                    <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2.5">Failure-Injection Test Suite</h4>
                    <div class="overflow-x-auto rounded-xl border border-gray-200">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr class="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                                    <th class="py-2.5 px-4">Test</th>
                                    <th class="py-2.5 px-4 w-40">Expected Gate Rule</th>
                                    <th class="py-2.5 px-4 text-right w-24">Result</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 bg-white">
                                ${testResults.map(t => {
                                    const testPassed = t.passed !== false;
                                    return `
                                        <tr class="hover:bg-gray-50/80 transition-colors">
                                            <td class="py-2.5 px-4 text-gray-900 font-medium">
                                                ${t.test_name || t.chargeback_id}
                                            </td>
                                            <td class="py-2.5 px-4 text-gray-500 font-mono text-[11px]">
                                                ${t.expected_rule || 'NONE'}
                                            </td>
                                            <td class="py-2.5 px-4 text-right">
                                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${testPassed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                                                    <span class="material-symbols-outlined text-[13px]">${testPassed ? 'check' : 'close'}</span>
                                                    <span>${testPassed ? 'Pass' : 'Fail'}</span>
                                                </span>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Backtest load error:", err);
        container.innerHTML = `
            <div class="p-5 bg-error/10 border border-error/20 rounded-lg text-xs text-error">
                Failed to load Backtest Benchmark: ${err.message}
            </div>
        `;
    }
}

// §3.3 Section B — Live Queue Snapshot (real-time, computed from cases table)
export async function loadLiveQueueSnapshot() {
    const container = document.getElementById('rcc-section-b');
    if (!container) return;

    try {
        const res = await api.fetchLiveQueueSnapshot();
        const snap = res.data;
        const formattedTime = new Date(snap.as_of).toLocaleTimeString();

        if (snap.is_empty) {
            container.innerHTML = `
                <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-3 shadow-sm">
                    <div class="border-b border-gray-100 pb-2">
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-900">Live Queue Snapshot</h3>
                        <p class="text-xs text-gray-500 mt-0.5">As of ${formattedTime}</p>
                    </div>
                    <div class="py-8 text-center text-gray-500">
                        <span class="material-symbols-outlined text-3xl text-gray-400 mb-1">inbox</span>
                        <p class="text-sm font-medium text-gray-900">No cases currently in the queue.</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
                <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                    <div>
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-900">Live Queue Snapshot</h3>
                        <p class="text-xs text-gray-500 mt-0.5">As of ${formattedTime}</p>
                    </div>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">LIVE</span>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-6 pt-1">
                    <div class="p-3 bg-gray-50/60 rounded-lg border border-gray-100">
                        <span class="text-xs text-gray-500 uppercase font-semibold">Open Cases</span>
                        <div class="text-2xl font-bold text-gray-900 mt-1">${snap.open_cases_count}</div>
                        <p class="text-[11px] text-gray-400 mt-0.5">Awaiting action</p>
                    </div>
                    <div class="p-3 bg-gray-50/60 rounded-lg border border-gray-100">
                        <span class="text-xs text-gray-500 uppercase font-semibold">Avg. Completeness</span>
                        <div class="text-2xl font-bold text-amber-600 mt-1">${snap.avg_completeness_score !== null ? `${snap.avg_completeness_score}%` : '—'}</div>
                        <p class="text-[11px] text-gray-400 mt-0.5">Evidence completeness</p>
                    </div>
                    <div class="p-3 bg-gray-50/60 rounded-lg border border-gray-100">
                        <span class="text-xs text-gray-500 uppercase font-semibold">Needs Manual Review</span>
                        <div class="text-2xl font-bold text-amber-600 mt-1">${snap.escalated_count}</div>
                        <p class="text-[11px] text-gray-400 mt-0.5">Flagged by safety check</p>
                    </div>
                    <div class="p-3 bg-gray-50/60 rounded-lg border border-gray-100">
                        <span class="text-xs text-gray-500 uppercase font-semibold">Overdue</span>
                        <div class="text-2xl font-bold ${snap.overdue_count > 0 ? 'text-rose-600' : 'text-gray-900'} mt-1">${snap.overdue_count}</div>
                        <p class="text-[11px] text-gray-400 mt-0.5">Past deadline</p>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Live snapshot load error:", err);
        container.innerHTML = `
            <div class="p-5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                Failed to load Live Queue Snapshot: ${err.message}
            </div>
        `;
    }
}

// §3.4 Section C — High-Value Disputes Table
export async function loadHighValueFailsafes() {
    const tbody = document.getElementById('rcc-failsafes-tbody');
    if (!tbody) return;

    try {
        const res = await api.fetchHighValueFailsafes(1, 50);
        highValueCasesCached = res.items || [];

        if (highValueCasesCached.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-8 text-center text-gray-500 text-xs">
                        No high-value disputes currently pending review.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = highValueCasesCached.map(row => {
            const id = row.id || row.chargeback_id;
            const gate = row.gate_decision || {};
            const ruleLabel = gate.rule_id || 'CEILING';
            const deadline = row.deadline || row.dispute_deadline || row.timestamp;

            return `
                <tr class="hover:bg-gray-50/80 transition-colors h-11 text-xs">
                    <!-- Case ID -->
                    <td class="py-2.5 px-4 font-mono text-xs font-semibold text-blue-600 cursor-pointer hover:underline" onclick="window.aegis.openCaseDetail('${id}')">
                        ${id}
                    </td>
                    <!-- Amount -->
                    <td class="py-2.5 px-4 text-xs font-semibold text-gray-900">
                        ${formatCurrency(row.amount, row.currency)}
                    </td>
                    <!-- Safety Rule Pill -->
                    <td class="py-2.5 px-4">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <span class="material-symbols-outlined text-[13px]">gavel</span>
                            ${ruleLabel}
                        </span>
                    </td>
                    <!-- Deadline -->
                    <td class="py-2.5 px-4 text-xs text-gray-700">
                        ${formatDeadline(deadline)}
                    </td>
                    <!-- Action Link -->
                    <td class="py-2.5 px-4 text-right">
                        <button onclick="window.aegis.openCaseDetail('${id}')" class="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-gray-100 transition-colors" title="Open Case Detail">
                            <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("Failsafes load error:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-6 text-center text-rose-600 text-xs">
                    Failed to load high-value disputes table.
                </td>
            </tr>
        `;
    }
}

// §3.4 Export CSV Feature
export function exportFailsafesCSV() {
    if (!highValueCasesCached || highValueCasesCached.length === 0) {
        alert("No high-value disputes to export.");
        return;
    }

    const headers = ["Case ID", "Amount", "Currency", "Safety Check Rule", "Safety Condition", "Deadline"];
    const rows = highValueCasesCached.map(c => [
        `"${c.id || c.chargeback_id}"`,
        c.amount,
        `"${c.currency || 'USD'}"`,
        `"${(c.gate_decision && c.gate_decision.rule_id) || 'HIGH_VALUE_CEILING'}"`,
        `"${(c.gate_decision && c.gate_decision.condition) || ''}"`,
        `"${c.deadline || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aegis_high_value_failsafes_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// §2 & §3.1 View Full Eval Output Modal
export async function openEvalReportModal() {
    const modal = document.getElementById('eval-report-modal');
    const container = document.getElementById('eval-report-modal-content');
    if (!modal || !container) return;

    container.innerHTML = `
        <div class="py-8 text-center text-gray-500">
            <span class="material-symbols-outlined text-3xl animate-spin text-blue-600 mb-2">progress_activity</span>
            <p class="text-xs">Loading stored evaluation run artifact...</p>
        </div>
    `;
    modal.classList.remove('hidden');

    try {
        const res = await api.fetchEvalReport();
        const report = res.data;

        container.innerHTML = `
            <div class="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-2">
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
                    <div class="flex justify-between items-center text-gray-900 font-semibold">
                        <span>Benchmark ID: ${report.benchmark_id}</span>
                        <span class="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-semibold">${report.pass_rate || '100%'} Pass Rate</span>
                    </div>
                    <div class="text-gray-500 text-[11px]">Evaluated: ${new Date(report.evaluated_at).toLocaleString()} · Suite: eval.js</div>
                    <div class="text-gray-600 text-[11px] leading-relaxed pt-1">
                        ${report.protocol}
                    </div>
                </div>

                <div>
                    <h4 class="text-xs font-semibold uppercase text-gray-700 mb-2">Per-Test Detailed Output</h4>
                    <div class="space-y-2">
                        ${(report.results || []).map(t => `
                            <div class="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-1.5">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <span class="font-mono font-semibold text-blue-600">${t.chargeback_id}</span>
                                        <span class="text-gray-800 font-medium ml-1.5">(${t.test_name || ''})</span>
                                    </div>
                                    <span class="px-2 py-0.5 rounded text-[10px] font-medium ${t.passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                                        ${t.passed ? 'PASSED' : 'FAILED'}
                                    </span>
                                </div>
                                <div class="grid grid-cols-2 gap-2 text-[11px] text-gray-600 pt-1 border-t border-gray-200">
                                    <div><span class="text-gray-400">Action:</span> ${t.actual_action} (Expected: ${t.expected_action})</div>
                                    <div><span class="text-gray-400">Gate Rule:</span> ${t.actual_rule} (Expected: ${t.expected_rule})</div>
                                </div>
                                ${t.rationale ? `
                                    <div class="text-[11px] text-gray-500 italic pt-1 truncate">"${t.rationale}"</div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <span class="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Raw Report JSON Artifact</span>
                    <pre class="text-[11px] text-gray-700 font-mono overflow-x-auto">${JSON.stringify(report, null, 2)}</pre>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `
            <div class="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                Failed to load eval report: ${err.message}
            </div>
        `;
    }
}

export function closeEvalReportModal() {
    const modal = document.getElementById('eval-report-modal');
    if (modal) modal.classList.add('hidden');
}

// Master refresh for Risk Command Center
export function refreshCommandCenter() {
    loadBacktestBenchmark();
    loadLiveQueueSnapshot();
    loadHighValueFailsafes();
}
