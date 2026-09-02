/**
 * Aegis Architecture Configuration & Constants
 * Sourced directly from aegis-PRD.md Section 7.1
 */

export interface ReasonCodeDef {
  code: string;
  category: string;
  cardNetwork: string;
  claim: string;
  requiredFields: string[];
}

export const REASON_CODE_CATALOG: Record<string, ReasonCodeDef> = {
  // 1. Goods/Services Not Received
  "13.1": {
    code: "13.1",
    category: "Goods/Services Not Received",
    cardNetwork: "Visa (13.1) / Mastercard (4855)",
    claim: "Cardholder claims they never received what they paid for",
    requiredFields: [
      "delivery_tracking",
      "carrier_delivery_confirmation",
      "customer_comm_log"
    ]
  },
  "4855": {
    code: "4855",
    category: "Goods/Services Not Received",
    cardNetwork: "Mastercard (4855)",
    claim: "Cardholder claims they never received what they paid for",
    requiredFields: [
      "delivery_tracking",
      "carrier_delivery_confirmation",
      "customer_comm_log"
    ]
  },

  // 2. Not as Described / Defective
  "13.3": {
    code: "13.3",
    category: "Not as Described / Defective",
    cardNetwork: "Visa (13.3) / Mastercard (4853)",
    claim: "Cardholder received item, but it is damaged, defective, or different",
    requiredFields: [
      "product_listing_snapshot",
      "delivery_confirmation",
      "customer_comm_log",
      "return_policy_ack"
    ]
  },
  "4853": {
    code: "4853",
    category: "Not as Described / Defective",
    cardNetwork: "Mastercard (4853)",
    claim: "Cardholder received item, but it is damaged, defective, or different",
    requiredFields: [
      "product_listing_snapshot",
      "delivery_confirmation",
      "customer_comm_log",
      "return_policy_ack"
    ]
  },

  // 3. Duplicate Processing
  "12.6.1": {
    code: "12.6.1",
    category: "Duplicate Processing",
    cardNetwork: "Visa (12.6.1) / Mastercard (4834)",
    claim: "Charged more than once for a single purchase",
    requiredFields: [
      "transaction_log",
      "avs_cvv_match",
      "customer_comm_log"
    ]
  },
  "4834": {
    code: "4834",
    category: "Duplicate Processing",
    cardNetwork: "Mastercard (4834)",
    claim: "Charged more than once for a single purchase",
    requiredFields: [
      "transaction_log",
      "avs_cvv_match",
      "customer_comm_log"
    ]
  },

  // 4. Unauthorized Transaction (Card Not Present)
  "10.4": {
    code: "10.4",
    category: "Unauthorized Transaction (Card-Not-Present)",
    cardNetwork: "Visa (10.4) / Mastercard (4837)",
    claim: "Cardholder claims they did not authorize or participate in the charge",
    requiredFields: [
      "avs_cvv_match",
      "device_ip_match",
      "prior_order_history",
      "customer_comm_log"
    ]
  },
  "4837": {
    code: "4837",
    category: "Unauthorized Transaction (Card-Not-Present)",
    cardNetwork: "Mastercard (4837)",
    claim: "Cardholder claims they did not authorize or participate in the charge",
    requiredFields: [
      "avs_cvv_match",
      "device_ip_match",
      "prior_order_history",
      "customer_comm_log"
    ]
  },

  // 5. Credit Not Processed
  "13.6": {
    code: "13.6",
    category: "Credit Not Processed",
    cardNetwork: "Visa (13.6) / Mastercard (4860)",
    claim: "Cardholder was promised a refund or credit that was never applied",
    requiredFields: [
      "refund_transaction_log",
      "refund_policy_ack",
      "customer_comm_log"
    ]
  },
  "4860": {
    code: "4860",
    category: "Credit Not Processed",
    cardNetwork: "Mastercard (4860)",
    claim: "Cardholder was promised a refund or credit that was never applied",
    requiredFields: [
      "refund_transaction_log",
      "refund_policy_ack",
      "customer_comm_log"
    ]
  }
};

export const GATE_CONFIG = {
  COMPLETENESS_THRESHOLD: 0.75, // 75% completeness required
  PRIOR_FRAUD_LIMIT: 2,         // >= 2 prior fraud flags triggers contradiction escalation
  AMOUNT_CEILING: 10000.00       // Auto-handling threshold ceiling ($10,000)
};
