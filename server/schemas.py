from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ActionEnum(str, Enum):
    CONTEST = "CONTEST"
    ACCEPT_LOSS = "ACCEPT_LOSS"
    ESCALATE_TO_HUMAN = "ESCALATE_TO_HUMAN"

class EvidenceStatus(str, Enum):
    PRESENT = "present"
    MISSING = "missing"
    UNVERIFIABLE = "unverifiable"

class DisputeEvent(BaseModel):
    chargeback_id: str
    reason_code: str
    transaction_id: str
    amount: float
    currency: str = "USD"
    dispute_deadline: str
    customer_id: str
    # Contains merchant transaction records, order details, comm logs
    raw_transaction_data: Optional[Dict[str, Any]] = None

class EvidenceItem(BaseModel):
    field: str
    status: EvidenceStatus
    source: str
    value: Optional[Any] = None

class GateDecision(BaseModel):
    passed: bool
    rule_triggered: Optional[str] = None
    reason: Optional[str] = None

class DisputeResponsePacket(BaseModel):
    chargeback_id: str
    reason_code: str
    amount: float
    currency: str
    action: ActionEnum
    confidence: float
    evidence_used: List[EvidenceItem]
    missing_evidence: List[str]
    rationale: str
    gate_decision: GateDecision
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
