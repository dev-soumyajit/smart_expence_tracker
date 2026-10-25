import pytest
from pydantic import ValidationError
from app.core.config import Settings


@pytest.mark.parametrize("override", [
    {"secret_key": "replace-with-a-random-secret-of-at-least-40-characters"},
    {"database_url": "sqlite:///./paisa.db"},
    {"frontend_origins": "http://localhost:3000"},
])
def test_production_rejects_unsafe_configuration(override):
    values = {"environment": "production", "secret_key": "ZxeUk5Kpx4RN1Y3q80VcLM2WjHg6BDa9SotfE7rQ", "database_url": "postgresql+psycopg://user:password@example.invalid/paisa?sslmode=require", "frontend_origins": "https://example.invalid"}
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**values, **override})
