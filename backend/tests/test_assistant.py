import httpx
from app.services.assistant import GroqInterpreter, Interpretation
from app.core.config import settings


def test_deterministic_answer(client, accounts):
    response = client.post("/api/v1/ai/ask", json={"question": "How much did I spend?"})
    assert response.status_code == 200
    assert "₹0.00" in response.json()["answer"]
    assert response.json()["mode"] == "deterministic"


def test_unconfigured_ai_falls_back(client, accounts):
    response = client.post("/api/v1/ai/ask", json={"question": "Can I spend more?", "share_with_ai": True})
    assert response.status_code == 200
    assert response.json()["mode"] == "fallback"


def test_ai_timeout(client, accounts, monkeypatch):
    async def timeout(*args):
        raise httpx.ReadTimeout("timeout")
    monkeypatch.setattr(GroqInterpreter, "interpret", timeout)
    response = client.post("/api/v1/ai/ask", json={"question": "My bills?", "share_with_ai": True})
    assert response.json()["mode"] == "fallback"
    assert client.get("/api/v1/accounts").status_code == 200


def test_ai_bad_response_and_validated_selection(client, accounts, monkeypatch):
    async def invalid(*args):
        return Interpretation.model_validate({"intent": "arbitrary_sql", "tips": []})
    monkeypatch.setattr(GroqInterpreter, "interpret", invalid)
    assert client.post("/api/v1/ai/ask", json={"question": "Tell me anything", "share_with_ai": True}).json()["mode"] == "fallback"
    async def valid(*args):
        return Interpretation(intent="income", tips=["record_cash"])
    monkeypatch.setattr(GroqInterpreter, "interpret", valid)
    result = client.post("/api/v1/ai/ask", json={"question": "Meri salary?", "share_with_ai": True}).json()
    assert result["mode"] == "groq"
    assert "₹0.00" in result["answer"]
    assert "ATM" in result["tips"][0]
