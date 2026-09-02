import os
import json
from typing import Dict, Any, Union, List
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

load_dotenv()

# Strict output schema matching PRD requirements
class DraftRationaleResponse(BaseModel):
    summary_statement: str = Field(
        description="Executive summary of the dispute and position."
    )
    evidence_narrative: str = Field(
        description="Detailed narrative discussing only items explicitly marked as 'present'."
    )
    missing_evidence_acknowledgment: str = Field(
        description="Explicit acknowledgment and context around any items marked 'missing'."
    )
    conclusion: str = Field(
        description="Final recommendation and concluding argument for the representment."
    )

DRAFTER_SYSTEM_INSTRUCTION = """
You are a specialized chargeback dispute drafter.
You will receive a JSON payload containing evidence_items (with 'present' or 'missing' statuses) and a gate_decision.
You must NEVER invent or hallucinate evidence that is not explicitly marked as 'present' in the payload.
You must output your response EXACTLY as a JSON object with the following keys:
- summary_statement
- evidence_narrative
- missing_evidence_acknowledgment
- conclusion

Rules:
1. Base all claims purely on the provided 'present' evidence items and gate decision.
2. If evidence items are 'missing', acknowledge them neutrally in 'missing_evidence_acknowledgment' without fabricating explanations.
3. Be professional, concise, objective, and legally sound for dispute representment.
"""

def extract_evidence_status(payload: dict):
    """Normalize evidence items into present vs missing lists."""
    present_items = []
    missing_items = []
    
    raw_evidence = payload.get("evidence_items", {})
    if isinstance(raw_evidence, dict):
        for k, v in raw_evidence.items():
            if isinstance(v, dict):
                status = v.get("status", "missing")
                val = v.get("value") or v.get("details")
                if status == "present":
                    present_items.append(f"{k.replace('_', ' ')}: {val if val is not None else 'Verified'}")
                else:
                    missing_items.append(k.replace('_', ' '))
            elif v:
                present_items.append(f"{k.replace('_', ' ')}: {v}")
            else:
                missing_items.append(k.replace('_', ' '))
    elif isinstance(raw_evidence, list):
        for item in raw_evidence:
            if isinstance(item, dict):
                name = item.get("name") or item.get("field", "item")
                status = item.get("status", "missing")
                val = item.get("value") or item.get("details")
                if status == "present":
                    present_items.append(f"{name.replace('_', ' ')}: {val if val is not None else 'Verified'}")
                else:
                    missing_items.append(name.replace('_', ' '))
                    
    return present_items, missing_items

def deterministic_draft_fallback(payload: dict) -> dict:
    """Deterministic, anti-hallucinating drafter engine when offline or testing without API key."""
    reason_code = payload.get("reason_code", "Unknown")
    category = payload.get("category", "General Dispute")
    gate = payload.get("gate_decision", {})
    gate_passed = gate.get("passed", True) if isinstance(gate, dict) else (str(gate).lower() == "true")
    gate_rule = gate.get("rule_triggered") if isinstance(gate, dict) else None

    present_items, missing_items = extract_evidence_status(payload)

    # 1. Summary Statement
    if gate_passed:
        summary_statement = (
            f"Formal dispute representment for Reason Code {reason_code} ({category}). "
            f"Deterministic gate verification passed with sufficient documented merchant evidence."
        )
    else:
        summary_statement = (
            f"Dispute assessment for Reason Code {reason_code} ({category}). "
            f"Failsafe gate flagged requirement for manual review (Rule: {gate_rule or 'INSUFFICIENT_EVIDENCE'})."
        )

    # 2. Evidence Narrative (strictly present evidence)
    if present_items:
        evidence_narrative = (
            "Merchant records confirm order fulfillment with the following verified evidence: "
            + "; ".join(present_items)
            + ". No additional unverified claims are asserted."
        )
    else:
        evidence_narrative = "No verified evidence items were marked as present in the transaction payload."

    # 3. Missing Evidence Acknowledgment
    if missing_items:
        missing_evidence_acknowledgment = (
            f"The following evidence items are missing from the current merchant record: [{', '.join(missing_items)}]. "
            "These gaps are explicitly acknowledged and have not been fabricated or presumed."
        )
    else:
        missing_evidence_acknowledgment = "All required canonical evidence items for this dispute category are present."

    # 4. Conclusion
    if gate_passed:
        conclusion = (
            f"We request that the chargeback under reason code {reason_code} be reversed (CONTEST) "
            "based strictly on the compelling fulfillment and delivery evidence submitted."
        )
    else:
        conclusion = (
            "Recommend escalating to a human dispute specialist (ESCALATE_TO_HUMAN) "
            f"due to gate flag [{gate_rule or 'INSUFFICIENT_EVIDENCE'}] and missing evidence."
        )

    return {
        "summary_statement": summary_statement,
        "evidence_narrative": evidence_narrative,
        "missing_evidence_acknowledgment": missing_evidence_acknowledgment,
        "conclusion": conclusion,
    }

class DrafterAgent:
    """Chargeback Sentinel isolated Drafter Agent."""
    
    def __init__(self, model: str = "gemini-2.5-flash"):
        self.api_key = os.getenv("GOOGLE_API_KEY")
        self.model = model
        self.client = None
        if self.api_key and self.api_key != "your_gemini_api_key_here":
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception:
                self.client = None

    async def draft_rationale(self, payload: dict) -> dict:
        """Invokes Gemini model with structured output or falls back to deterministic anti-hallucination engine."""
        # Check if active Gemini client with valid key is available
        if not self.client and (os.getenv("GOOGLE_API_KEY") and os.getenv("GOOGLE_API_KEY") != "your_gemini_api_key_here"):
            try:
                self.client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
            except Exception:
                self.client = None

        if self.client:
            try:
                prompt = (
                    "Analyze the following evidence payload and gate decision, "
                    f"then generate the dispute rationale:\n\n{json.dumps(payload, indent=2)}"
                )
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=DRAFTER_SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                        response_schema=DraftRationaleResponse,
                        temperature=0.1,
                    ),
                )
                if response.parsed:
                    return response.parsed.model_dump()
                if response.text:
                    return json.loads(response.text)
            except Exception as e:
                # Log error and utilize strict deterministic fallback
                print(f"[DrafterAgent] LLM invocation error ({e}), utilizing deterministic anti-hallucination fallback.")
                return deterministic_draft_fallback(payload)

        # Direct deterministic engine
        return deterministic_draft_fallback(payload)

# Instantiate default agent
drafter_agent = DrafterAgent()
