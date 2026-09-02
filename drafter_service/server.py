import os
import uvicorn
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from dotenv import load_dotenv

from agent import drafter_agent, DraftRationaleResponse

load_dotenv()

app = FastAPI(
    title="Chargeback Sentinel - Drafter Service",
    description="Isolated anti-hallucinating drafter microservice for dispute rationales.",
    version="1.0.0",
)

# Enable CORS for local Node backend/UI integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "drafter_service"}

@app.post("/draft-rationale", response_model=DraftRationaleResponse)
async def draft_rationale(payload: Dict[str, Any] = Body(...)):
    try:
        result = await drafter_agent.draft_rationale(payload)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate draft rationale: {str(e)}"
        )

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
