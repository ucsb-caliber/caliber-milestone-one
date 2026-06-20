from fastapi import FastAPI
from pydantic import BaseModel

from app.coding import execute_coding_request


app = FastAPI(title="Caliber Coding Runner", version="1.0.0")


class RunnerExecuteRequest(BaseModel):
    source_code: str
    language: str = "cpp"
    tests: list[dict] = []
    time_limit_ms: int = 2000
    memory_limit_mb: int = 256


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/execute")
def execute(payload: RunnerExecuteRequest) -> dict:
    return execute_coding_request(payload.model_dump())
