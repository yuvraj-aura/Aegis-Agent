/**
 * Shared Application State
 */
export const state = {
    taxonomy: {}, // Canonical reason_codes map { code: { official_name, ... } }
    serverTimeOffset: 0, // ms offset between client clock and authoritative server time (§5.3)
    currentPage: 1,
    pageSize: 25,
    currentSort: 'deadline_asc',
    currentFilters: {
        reason_codes: [],
        evidence_statuses: [],
        deadline_filter: 'all',
        confidence_band: 'all'
    },
    cachedCases: [],
    isFetching: false
};
