import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ScenarioCreate(BaseModel):
    scenario_type: Literal["retirement", "house"]
    scenario_name: str
    assumptions: dict


class ScenarioUpdate(BaseModel):
    scenario_name: str | None = None
    assumptions: dict | None = None


class ScenarioRead(BaseModel):
    scenario_id: uuid.UUID
    scenario_type: str
    scenario_name: str
    assumptions: dict
    created_date: datetime
    updated_date: datetime


class ScenarioComparison(BaseModel):
    scenario_id: uuid.UUID
    scenario_name: str
    assumptions: dict
    result: dict
