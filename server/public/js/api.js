/**
 * API Service for communicating with backend endpoints
 */
export const api = {
    async fetchServerTime() {
        const res = await fetch('/api/server-time');
        if (!res.ok) throw new Error('Failed to fetch server time');
        return await res.json();
    },

    async fetchReasonCodes() {
        const res = await fetch('/api/reason-codes');
        if (!res.ok) throw new Error('Failed to fetch reason codes');
        return await res.json();
    },

    async fetchCases(params) {
        const res = await fetch(`/api/cases?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load worklist`);
        return await res.json();
    },

    // PRD_Case_Detail §4.5 Endpoints
    async fetchCaseDetail(id) {
        const res = await fetch(`/api/cases/${id}`);
        if (!res.ok) throw new Error(`Failed to load case ${id}: ${res.statusText}`);
        return await res.json();
    },

    async recordOverride(id, reason, analyst_id = "analyst_01") {
        const res = await fetch(`/api/cases/${id}/override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason, analyst_id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to record override');
        return data;
    },

    async patchEvidence(caseId, evidenceId, override_value, analyst_id = "analyst_01") {
        const res = await fetch(`/api/cases/${caseId}/evidence/${evidenceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ override_value, analyst_id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to patch evidence');
        return data;
    },

    async preparePacket(id) {
        const res = await fetch(`/api/cases/${id}/prepare-packet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to prepare packet');
        return data;
    },

    async submitPacket(id, packet_text, submitted_by = "analyst_01") {
        const res = await fetch(`/api/cases/${id}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packet_text, submitted_by })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit packet');
        return data;
    },

    async recordOutcome(id, decision, decided_by = "analyst_01") {
        const res = await fetch(`/api/cases/${id}/outcome`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision, decided_by })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to record outcome');
        return data;
    },

    async sendWebhook(payload) {
        const res = await fetch('/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Webhook error: ${res.statusText}`);
        return await res.json();
    },

    // PRD_Risk_Command_Center §4.4 Endpoints
    async fetchCurrentEvalRun() {
        const res = await fetch('/api/eval-runs/current');
        if (!res.ok) throw new Error('Failed to fetch backtest benchmark');
        return await res.json();
    },

    async fetchEvalReport() {
        const res = await fetch('/api/eval-runs/current/report');
        if (!res.ok) throw new Error('Failed to fetch eval report');
        return await res.json();
    },

    async fetchLiveQueueSnapshot() {
        const res = await fetch('/api/cases/live-snapshot');
        if (!res.ok) throw new Error('Failed to fetch live queue snapshot');
        return await res.json();
    },

    async fetchHighValueFailsafes(page = 1, pageSize = 25) {
        const res = await fetch(`/api/cases/high-value-failsafes?page=${page}&page_size=${pageSize}`);
        if (!res.ok) throw new Error('Failed to fetch high-value failsafes');
        return await res.json();
    },

    async fetchMetrics() {
        const res = await fetch('/api/metrics');
        if (!res.ok) throw new Error('Failed to fetch metrics');
        return await res.json();
    },

    async fetchAuditLogs() {
        const res = await fetch('/api/audit-logs');
        if (!res.ok) throw new Error('Failed to fetch audit logs');
        return await res.json();
    }
};
