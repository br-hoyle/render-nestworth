from pydantic import BaseModel


class KpiMetric(BaseModel):
    slug: str
    label: str
    group: str
    value: float | None
    unit: str  # "months" | "percent" | "ratio" | "dollars"
    color: str  # "green" | "yellow" | "red" | "coral"
    # Set only for metrics whose headline value is a dollar target rather than a percent —
    # the progress bar renders from this instead of the value itself.
    progress_pct: float | None = None


class ScorecardResponse(BaseModel):
    as_of: str
    metrics: list[KpiMetric]


class KpiHistoryPoint(BaseModel):
    date: str
    value: float | None


class KpiHistoryResponse(BaseModel):
    slug: str
    points: list[KpiHistoryPoint]
