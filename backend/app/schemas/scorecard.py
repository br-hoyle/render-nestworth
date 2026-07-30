from pydantic import BaseModel


class KpiMetric(BaseModel):
    slug: str
    label: str
    group: str
    value: float | None
    unit: str  # "months" | "percent" | "ratio" | "dollars" | "mix"
    color: str  # "green" | "yellow" | "red" | "coral"
    mix: dict[str, float] | None = None


class ScorecardResponse(BaseModel):
    as_of: str
    metrics: list[KpiMetric]


class KpiHistoryPoint(BaseModel):
    date: str
    value: float | None


class KpiHistoryResponse(BaseModel):
    slug: str
    points: list[KpiHistoryPoint]
