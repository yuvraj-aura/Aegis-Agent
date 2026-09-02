export const PRESETS = {
    clean_contest: {
        chargeback_id: "CB-" + Math.floor(1000 + Math.random() * 9000),
        reason_code: "10.4",
        transaction_id: "txn_" + Date.now(),
        amount: 850.00,
        currency: "USD",
        dispute_deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        customer_id: "cust_101",
        raw_transaction_data: {
            avs_cvv_match: "Full Match (AVS Y / CVV M)",
            device_ip_match: "192.168.1.100 (Known Device)",
            prior_order_history: "15 successful transactions",
            customer_comm_log: "Customer acknowledged order confirmation",
            prior_fraud_flags: 0
        }
    },
    not_received: {
        chargeback_id: "CB-" + Math.floor(1000 + Math.random() * 9000),
        reason_code: "13.1",
        transaction_id: "txn_" + Date.now(),
        amount: 320.00,
        currency: "USD",
        dispute_deadline: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
        customer_id: "cust_102",
        raw_transaction_data: {
            delivery_tracking: "FEDEX_998811",
            carrier_delivery_confirmation: "Signed by Customer on porch",
            customer_comm_log: "Email acknowledging package received",
            prior_fraud_flags: 0
        }
    },
    contradiction: {
        chargeback_id: "CB-" + Math.floor(1000 + Math.random() * 9000),
        reason_code: "13.1",
        transaction_id: "txn_" + Date.now(),
        amount: 450.00,
        currency: "USD",
        dispute_deadline: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
        customer_id: "cust_103",
        raw_transaction_data: {
            delivery_tracking: "FEDEX_889922",
            carrier_delivery_confirmation: "Signed by recipient",
            customer_comm_log: "Delivery confirmed via chat",
            prior_fraud_flags: 3
        }
    },
    missing_gaps: {
        chargeback_id: "CB-" + Math.floor(1000 + Math.random() * 9000),
        reason_code: "13.3",
        transaction_id: "txn_" + Date.now(),
        amount: 190.00,
        currency: "USD",
        dispute_deadline: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
        customer_id: "cust_104",
        raw_transaction_data: {
            product_listing_snapshot: "Item SKU-99",
            prior_fraud_flags: 0
        }
    },
    canceled_recurring: {
        chargeback_id: "CB-" + Math.floor(1000 + Math.random() * 9000),
        reason_code: "13.2",
        transaction_id: "txn_" + Date.now(),
        amount: 49.00,
        currency: "USD",
        dispute_deadline: new Date(Date.now() + 6 * 86400 * 1000).toISOString(),
        customer_id: "cust_105",
        raw_transaction_data: {
            cancellation_policy_ack: "Signed terms at checkout",
            billing_history: "Monthly subscription active for 6 months",
            customer_comm_log: "Cancellation request received after billing date",
            prior_fraud_flags: 0
        }
    },
    high_value: {
        chargeback_id: "CB-" + Math.floor(1000 + Math.random() * 9000),
        reason_code: "10.4",
        transaction_id: "txn_" + Date.now(),
        amount: 15400.00,
        currency: "USD",
        dispute_deadline: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
        customer_id: "cust_106",
        raw_transaction_data: {
            avs_cvv_match: "Match",
            device_ip_match: "Match",
            prior_order_history: "5 orders",
            customer_comm_log: "Verified",
            prior_fraud_flags: 0
        }
    },
    unknown_code: {
        chargeback_id: "CB-" + Math.floor(1000 + Math.random() * 9000),
        reason_code: "99.9_UNKNOWN",
        transaction_id: "txn_" + Date.now(),
        amount: 320.00,
        currency: "USD",
        dispute_deadline: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
        customer_id: "cust_107",
        raw_transaction_data: {
            delivery_tracking: "TRK_1122"
        }
    }
};
