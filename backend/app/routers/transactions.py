import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.transactions import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    PreviewErrorRow,
    PreviewRow,
    TransactionRead,
)
from app.services.csv_import import (
    compute_fingerprint,
    detect_headers,
    headers_match_expected,
    parse_and_classify,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _existing_fingerprints(conn: Connection, household_id: str) -> set[str]:
    rows = conn.execute(
        text("select dedup_fingerprint from transactions where household_id = :household_id"),
        {"household_id": household_id},
    ).all()
    return {r[0] for r in rows}


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    column_mapping: str | None = Form(default=None),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> ImportPreviewResponse:
    raw_bytes = await file.read()
    csv_text = raw_bytes.decode("utf-8-sig", errors="replace")

    headers = detect_headers(csv_text)
    mapping = json.loads(column_mapping) if column_mapping else None

    if not mapping and not headers_match_expected(headers):
        return ImportPreviewResponse(
            source_file=file.filename or "upload.csv",
            needs_mapping=True,
            detected_headers=headers,
        )

    existing = _existing_fingerprints(conn, session.household_id)
    new_rows, dupe_rows, errors = parse_and_classify(
        csv_text, session.household_id, existing, column_mapping=mapping
    )

    return ImportPreviewResponse(
        source_file=file.filename or "upload.csv",
        new_rows=[PreviewRow(**vars(r)) for r in new_rows],
        duplicate_rows=[PreviewRow(**vars(r)) for r in dupe_rows],
        errors=[PreviewErrorRow(row_number=e.row_number, raw=e.raw, reason=e.reason) for e in errors],
    )


@router.post("/import/commit", response_model=ImportCommitResponse, status_code=status.HTTP_201_CREATED)
def commit_import(
    payload: ImportCommitRequest,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> ImportCommitResponse:
    existing = _existing_fingerprints(conn, session.household_id)

    inserted = 0
    for row in payload.rows:
        # Recompute the fingerprint server-side rather than trusting the client's copy,
        # and re-check against the DB to close the race window since preview was computed.
        fingerprint = compute_fingerprint(session.household_id, row.date, row.merchant, row.amount, row.note)
        if fingerprint in existing:
            continue
        existing.add(fingerprint)

        result = conn.execute(
            text(
                """
                insert into transactions
                    (transaction_id, household_id, date, "group", item, type, merchant,
                     account_name, amount, note, source_file, dedup_fingerprint)
                values
                    (:transaction_id, :household_id, :date, :group, :item, :type, :merchant,
                     :account_name, :amount, :note, :source_file, :fingerprint)
                on conflict (household_id, dedup_fingerprint) do nothing
                """
            ),
            {
                "transaction_id": uuid.uuid4(),
                "household_id": session.household_id,
                "date": row.date,
                "group": row.group,
                "item": row.item,
                "type": row.type,
                "merchant": row.merchant,
                "account_name": row.account_name,
                "amount": row.amount,
                "note": row.note,
                "source_file": payload.source_file,
                "fingerprint": fingerprint,
            },
        )
        inserted += result.rowcount

    return ImportCommitResponse(inserted_count=inserted, source_file=payload.source_file)


@router.delete("/import/{source_file}", status_code=status.HTTP_204_NO_CONTENT)
def undo_import(
    source_file: str,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    conn.execute(
        text("delete from transactions where household_id = :household_id and source_file = :source_file"),
        {"household_id": session.household_id, "source_file": source_file},
    )


@router.get("", response_model=list[TransactionRead])
def list_transactions(
    group: str | None = None,
    search: str | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=200, le=1000),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[TransactionRead]:
    query = 'select transaction_id, date, "group", item, type, merchant, account_name, amount, note, source_file from transactions where household_id = :household_id'
    params: dict = {"household_id": session.household_id}

    if group:
        query += ' and "group" = :group'
        params["group"] = group
    if search:
        query += " and merchant ilike :search"
        params["search"] = f"%{search}%"
    if start:
        query += " and date >= :start"
        params["start"] = start
    if end:
        query += " and date <= :end"
        params["end"] = end

    query += " order by date desc limit :limit"
    params["limit"] = limit

    rows = conn.execute(text(query), params).mappings().all()
    return [TransactionRead(**row) for row in rows]
