import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.calculators import HouseAffordabilityInput, RetirementInput
from app.schemas.scenarios import ScenarioComparison, ScenarioCreate, ScenarioRead, ScenarioUpdate
from app.services.calculators import house_affordability, retirement

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

# "Save as scenario" is the only write path into this table, and it reuses the exact same
# input schema as the matching calculator (per CLAUDE.md) — no separate scenario schema.
SCENARIO_SCHEMAS = {
    "retirement": (RetirementInput, retirement.compute),
    "house": (HouseAffordabilityInput, house_affordability.compute),
}


@router.get("", response_model=list[ScenarioRead])
def list_scenarios(
    scenario_type: str | None = None,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[ScenarioRead]:
    query = "select * from scenarios where household_id = :household_id"
    params = {"household_id": session.household_id}
    if scenario_type:
        query += " and scenario_type = :scenario_type"
        params["scenario_type"] = scenario_type
    query += " order by created_date desc"
    rows = conn.execute(text(query), params).mappings().all()
    return [ScenarioRead(**row) for row in rows]


@router.post("", response_model=ScenarioRead, status_code=status.HTTP_201_CREATED)
def create_scenario(
    payload: ScenarioCreate,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> ScenarioRead:
    input_model, _ = SCENARIO_SCHEMAS[payload.scenario_type]
    try:
        validated = input_model(**payload.assumptions)
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Invalid assumptions: {e}")

    scenario_id = uuid.uuid4()
    row = conn.execute(
        text(
            """
            insert into scenarios (scenario_id, household_id, scenario_type, scenario_name, assumptions)
            values (:scenario_id, :household_id, :scenario_type, :scenario_name, :assumptions)
            returning *
            """
        ),
        {
            "scenario_id": scenario_id,
            "household_id": session.household_id,
            "scenario_type": payload.scenario_type,
            "scenario_name": payload.scenario_name,
            "assumptions": validated.model_dump_json(),
        },
    ).mappings().first()
    return ScenarioRead(**row)


@router.patch("/{scenario_id}", response_model=ScenarioRead)
def update_scenario(
    scenario_id: uuid.UUID,
    payload: ScenarioUpdate,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> ScenarioRead:
    current = conn.execute(
        text("select * from scenarios where scenario_id = :scenario_id and household_id = :household_id"),
        {"scenario_id": scenario_id, "household_id": session.household_id},
    ).mappings().first()
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    name = payload.scenario_name if payload.scenario_name is not None else current["scenario_name"]
    assumptions = current["assumptions"]
    if payload.assumptions is not None:
        input_model, _ = SCENARIO_SCHEMAS[current["scenario_type"]]
        try:
            validated = input_model(**payload.assumptions)
        except Exception as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Invalid assumptions: {e}")
        assumptions = validated.model_dump_json()

    row = conn.execute(
        text(
            """
            update scenarios
            set scenario_name = :name, assumptions = cast(:assumptions as jsonb), updated_date = now()
            where scenario_id = :scenario_id
            returning *
            """
        ),
        {
            "name": name,
            "assumptions": assumptions if isinstance(assumptions, str) else json.dumps(assumptions),
            "scenario_id": scenario_id,
        },
    ).mappings().first()
    return ScenarioRead(**row)


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: uuid.UUID,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    conn.execute(
        text("delete from scenarios where scenario_id = :scenario_id and household_id = :household_id"),
        {"scenario_id": scenario_id, "household_id": session.household_id},
    )


@router.get("/compare", response_model=list[ScenarioComparison])
def compare_scenarios(
    ids: list[uuid.UUID] = Query(...),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[ScenarioComparison]:
    rows = conn.execute(
        text("select * from scenarios where household_id = :household_id and scenario_id = any(:ids)"),
        {"household_id": session.household_id, "ids": [str(i) for i in ids]},
    ).mappings().all()

    results = []
    for row in rows:
        input_model, compute_fn = SCENARIO_SCHEMAS[row["scenario_type"]]
        validated = input_model(**row["assumptions"])
        result = compute_fn(**validated.model_dump())
        results.append(
            ScenarioComparison(
                scenario_id=row["scenario_id"],
                scenario_name=row["scenario_name"],
                assumptions=row["assumptions"],
                result=result,
            )
        )
    return results
