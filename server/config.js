import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single Source of Truth: load reason_codes.json
const reasonCodesRaw = fs.readFileSync(path.join(__dirname, 'reason_codes.json'), 'utf-8');
export const REASON_CODES_LIST = JSON.parse(reasonCodesRaw);

// Map by Code for O(1) deterministic lookups
export const REASON_CODE_CATALOG = {};
for (const entry of REASON_CODES_LIST) {
  REASON_CODE_CATALOG[entry.code] = {
    code: entry.code,
    category: entry.category,
    official_name: entry.official_name,
    cardNetwork: `${entry.network} (${entry.code}) / Mastercard (${entry.mastercard_equivalent})`,
    claim: entry.cardholder_claim,
    requiredFields: entry.evidence_required
  };
  // Also register Mastercard equivalent
  if (entry.mastercard_equivalent) {
    REASON_CODE_CATALOG[entry.mastercard_equivalent] = {
      code: entry.mastercard_equivalent,
      category: entry.category,
      official_name: entry.official_name,
      cardNetwork: `Mastercard (${entry.mastercard_equivalent}) / ${entry.network} (${entry.code})`,
      claim: entry.cardholder_claim,
      requiredFields: entry.evidence_required
    };
  }
}

export const GATE_CONFIG = {
  COMPLETENESS_THRESHOLD: 0.75, // 75% completeness required
  PRIOR_FRAUD_LIMIT: 2,         // >= 2 prior fraud flags triggers contradiction escalation
  AMOUNT_CEILING: 10000.00       // Auto-handling threshold ceiling ($10,000)
};
