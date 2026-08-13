from pydantic import BaseModel


class KpiInputItem(BaseModel):
    label: str
    value: float | None
    unit: str  # "months" | "percent" | "ratio" | "dollars" | "number"


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
    # The actual numbers plugged into this metric's formula, in the same order the formula
    # text lists them — powers the Scorecard detail modal's "Your numbers" table so the
    # household can audit the math instead of taking the formula on faith.
    inputs: list[KpiInputItem] = []


class ScorecardResponse(BaseModel):
    as_of: str
    metrics: list[KpiMetric]


class KpiHistoryPoint(BaseModel):
    date: str
    value: float | None


class KpiHistoryResponse(BaseModel):
    slug: str
    points: list[KpiHistoryPoint]


class AllKpiHistoryResponse(BaseModel):
    # slug -> points, every registered metric (including the hidden Budget-rule ones —
    # harmless to include, the frontend just ignores slugs it doesn't render as a tile).
    series: dict[str, list[KpiHistoryPoint]]
