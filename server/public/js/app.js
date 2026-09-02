import { state } from './state.js';
import { api } from './api.js';
import * as worklist from './worklist.js';
import * as caseDetail from './case_detail.js';
import * as commandCenter from './command_center.js';

// Expose full aegis controller to window for inline onclick bindings
window.aegis = {
    ...worklist,
    ...caseDetail,
    ...commandCenter
};

// Section 4.4: Authoritative Server Time & Taxonomy Bootstrapping
async function bootstrap() {
    try {
        // 1. Fetch Authoritative Server Time (§5.3)
        const timeRes = await api.fetchServerTime();
        if (timeRes.timestamp_ms) {
            state.serverTimeOffset = timeRes.timestamp_ms - Date.now();
            const d = new Date(timeRes.server_time);
            const pill = document.getElementById('server-time-pill');
            if (pill) pill.innerText = `Server Time: ${d.toLocaleTimeString()}`;
        }

        // 2. Fetch Canonical Reason Code Taxonomy (§4.2)
        const codeRes = await api.fetchReasonCodes();
        if (codeRes.data) {
            const filterList = document.getElementById('filter-reason-codes-list');
            const dnaList = document.getElementById('dna-table-body');
            
            filterList.innerHTML = codeRes.data.map(c => {
                state.taxonomy[c.code] = c;
                if (c.mastercard_equivalent) state.taxonomy[c.mastercard_equivalent] = c;
                return `
                    <label class="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-700 hover:text-gray-900">
                        <input type="checkbox" value="${c.code}" onchange="window.aegis.onFilterChange()" class="filter-code rounded border-gray-300 text-blue-600 focus:ring-blue-500 text-xs"/>
                        <span class="font-mono font-semibold text-gray-900">${c.code}</span>
                        <span class="text-gray-600 truncate">· ${c.official_name}</span>
                    </label>
                `;
            }).join('');

            if (dnaList) {
                dnaList.innerHTML = codeRes.data.map(c => `
                    <tr class="hover:bg-gray-50/80 transition-colors">
                        <td class="py-2.5 px-4 text-blue-600 font-mono font-semibold">${c.code}</td>
                        <td class="py-2.5 px-4 font-medium text-gray-900">${c.official_name}</td>
                        <td class="py-2.5 px-4 text-gray-600">${c.category}</td>
                        <td class="py-2.5 px-4 text-gray-500 font-mono text-[11px]">${c.evidence_required.join(', ')}</td>
                    </tr>
                `).join('');
            }
        }

        // 3. Read initial query params from URL if present (§3.2, §3.3)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('sort')) state.currentSort = urlParams.get('sort');
        if (urlParams.has('deadline_filter')) {
            state.currentFilters.deadline_filter = urlParams.get('deadline_filter');
            const dEl = document.getElementById('filter-deadline');
            if (dEl) dEl.value = state.currentFilters.deadline_filter;
        }
        if (urlParams.has('confidence_band')) {
            state.currentFilters.confidence_band = urlParams.get('confidence_band');
            const cEl = document.getElementById('filter-confidence');
            if (cEl) cEl.value = state.currentFilters.confidence_band;
        }

        // 4. Initial Landing Screen: Risk Command Center (§1)
        worklist.switchTab('dashboard');
    } catch (err) {
        console.error("Bootstrap error:", err);
        worklist.switchTab('dashboard');
    }
}

// Close dropdowns on outside click
window.addEventListener('click', (e) => {
    const filterPanel = document.getElementById('filter-panel');
    const sortPanel = document.getElementById('sort-panel');
    if (filterPanel && !e.target.closest('#filter-btn') && !e.target.closest('#filter-panel')) {
        filterPanel.classList.add('hidden');
    }
    if (sortPanel && !e.target.closest('#sort-btn') && !e.target.closest('#sort-panel')) {
        sortPanel.classList.add('hidden');
    }
});

// Auto-run bootstrap on module load
bootstrap();
