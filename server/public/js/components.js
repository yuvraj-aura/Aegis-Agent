import { state } from './state.js';

/**
 * §5.2: Shared Reason Code Component Helper
 */
export function renderReasonCode(code) {
    const entry = state.taxonomy[code];
    const officialName = entry ? entry.official_name : "Unrecognized Reason Code";
    return `<span class="inline-flex items-center gap-1.5"><span class="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-900">${code}</span> <span class="text-gray-600 text-xs">${officialName}</span></span>`;
}

/**
 * §5.3: Format Deadline against Authoritative Server Time
 */
export function formatDeadline(isoString) {
    if (!isoString) return `<span class="text-gray-400">—</span>`;
    const deadlineDate = new Date(isoString);
    if (isNaN(deadlineDate.getTime())) {
        return `<span class="text-gray-600">${isoString}</span>`;
    }

    const serverNow = new Date(Date.now() + state.serverTimeOffset);
    const diffMs = deadlineDate.getTime() - serverNow.getTime();
    const isToday = deadlineDate.toDateString() === serverNow.toDateString();
    const isUnder24Hours = diffMs > 0 && diffMs < 24 * 3600 * 1000;
    const isOverdue = diffMs <= 0;

    let formattedText = "";
    if (isToday) {
        const hours = String(deadlineDate.getHours()).padStart(2, '0');
        const mins = String(deadlineDate.getMinutes()).padStart(2, '0');
        formattedText = `Today, ${hours}:${mins}`;
    } else {
        const month = deadlineDate.toLocaleString('en-US', { month: 'short' });
        const day = deadlineDate.getDate();
        formattedText = `${month} ${day}`;
    }

    if (isOverdue) {
        return `<span class="text-rose-600 font-medium text-xs">${formattedText} (Overdue)</span>`;
    }
    if (isUnder24Hours) {
        return `<span class="text-amber-600 font-medium text-xs">${formattedText}</span>`;
    }
    return `<span class="text-gray-700 text-xs">${formattedText}</span>`;
}

/**
 * Format Currency dynamically (§3.4 Column 3)
 */
export function formatCurrency(amount, currency = "USD") {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch (e) {
        return `$${Number(amount).toFixed(2)}`;
    }
}

/**
 * Section 3.5: Action Button Component — Reads worklist_action_available only
 */
export function renderActionButton(row) {
    let action = row.worklist_action_available;
    const id = row.id || row.chargeback_id;

    // Fallback for legacy records
    if (!action) {
        if (row.gate_decision && row.gate_decision.action === 'require_manual_review') {
            action = 'escalate_human';
        } else if (row.action === 'ESCALATE_TO_HUMAN') {
            action = 'escalate_human';
        } else if (row.completeness_score >= 75 || (row.confidence && row.confidence >= 0.75)) {
            action = 'prepare_packet';
        } else {
            action = 'review_gaps';
        }
    }

    if (action === 'prepare_packet') {
        return `
            <button onclick="window.aegis.navigateAction('${id}', 'prepare-packet')" class="btn-primary h-7 px-3 rounded-lg text-xs font-medium cursor-pointer shadow-sm">
                Compile Evidence
            </button>
        `;
    }
    if (action === 'review_gaps') {
        return `
            <button onclick="window.aegis.navigateAction('${id}', 'evidence')" class="btn-secondary h-7 px-3 rounded-lg border border-gray-200 bg-white text-gray-700 hover:text-gray-900 text-xs font-medium cursor-pointer shadow-sm">
                Review Missing Info
            </button>
        `;
    }
    if (action === 'escalate_human') {
        return `
            <button onclick="window.aegis.navigateAction('${id}', 'detail')" class="btn-warning h-7 px-3 rounded-lg text-xs font-medium cursor-pointer shadow-sm">
                Needs Manual Review
            </button>
        `;
    }

    // §3.5 Unrecognized action -> small warning icon, no button
    return `
        <span class="inline-flex items-center gap-1 text-rose-500 text-xs font-medium" title="Data integrity warning: unrecognized action">
            <span class="material-symbols-outlined text-[15px]">warning</span>
            <span>Needs Attention</span>
        </span>
    `;
}
