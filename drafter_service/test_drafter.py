import json
import urllib.request
import urllib.error

ENDPOINT = "http://localhost:8001/draft-rationale"

TEST_PAYLOAD = {
    "reason_code": "13.1",
    "category": "Goods Not Received",
    "gate_decision": {
        "passed": True,
        "rule_triggered": None
    },
    "evidence_items": {
        "delivery_tracking": { "status": "present", "value": "FedEx 123456789" },
        "carrier_delivery_confirmation": { "status": "present", "value": "Front porch drop-off" },
        "customer_comm_log": { "status": "missing", "value": None }
    }
}

REQUIRED_KEYS = [
    "summary_statement",
    "evidence_narrative",
    "missing_evidence_acknowledgment",
    "conclusion"
]

def run_test():
    print("================================================================")
    print("[TEST] Executing Isolation Test for Chargeback Sentinel Drafter")
    print(f"[TARGET] Endpoint: {ENDPOINT}")
    print("================================================================")
    print("\n[REQUEST PAYLOAD]")
    print(json.dumps(TEST_PAYLOAD, indent=2))
    
    data = json.dumps(TEST_PAYLOAD).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status_code = response.getcode()
            raw_body = response.read().decode("utf-8")
            
            print(f"\n[HTTP STATUS CODE]: {status_code}")
            print("\n[RAW RESPONSE BODY]:")
            print(raw_body)
            
            # JSON Parsing and Schema Validation
            try:
                parsed_json = json.loads(raw_body)
                print("\n[SCHEMA VALIDATION - REQUIRED KEYS]:")
                all_keys_present = True
                for key in REQUIRED_KEYS:
                    if key in parsed_json and parsed_json[key]:
                        print(f"  [PASS] '{key}': Present ({len(str(parsed_json[key]))} chars)")
                    else:
                        print(f"  [FAIL] '{key}': MISSING or EMPTY")
                        all_keys_present = False
                        
                if all_keys_present:
                    print("\n[RESULT] TEST PASSED: Response strictly complies with the required structured JSON schema.")
                else:
                    print("\n[RESULT] TEST FAILED: Missing one or more required keys.")
                    
            except json.JSONDecodeError as jde:
                print(f"\n[ERROR] JSON Decode Error: {jde}")
                
    except urllib.error.HTTPError as e:
        print(f"\n[ERROR] HTTP Error {e.code}: {e.reason}")
        print(e.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"\n[ERROR] URL Error: {e.reason}")
    except Exception as e:
        print(f"\n[ERROR] Unexpected Error: {e}")

if __name__ == "__main__":
    run_test()
