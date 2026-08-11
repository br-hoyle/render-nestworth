import csv
import io
import json
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.transactions import (
    CategorySummaryRow,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    PreviewErrorRow,
    PreviewRow,
    TransactionCategoryRule,
    TransactionCreate,
    TransactionListResponse,
    TransactionRead,
    TransactionUpdate,
    UnclassifiedGroup,
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


_CATEGORY_JOIN = """
    from transactions t
    left join transaction_categories tc_item
        on tc_item.household_id = t.household_id
        and tc_item."group" = coalesce(t."group", '')
        and tc_item.item = coalesce(t.item, '')
    left join transaction_categories tc_group
        on tc_group.household_id = t.household_id
        and tc_group."group" = coalesce(t."group", '')
        and tc_group.item = ''
"""


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> TransactionRead:
    """Manual single-transaction entry — same dedup fingerprint as the CSV import path, so a
    manually-typed transaction that happens to match an already-imported row (or a duplicate
    click) is silently absorbed rather than double-counted."""
    fingerprint = compute_fingerprint(session.household_id, payload.date, payload.merchant or "", payload.amount, payload.note or "")
    row = conn.execute(
        text(
            """
            insert into transactions
                (transaction_id, household_id, date, "group", item, type, merchant,
                 account_name, amount, note, source_file, dedup_fingerprint)
            values
                (:transaction_id, :household_id, :date, :group, :item, :type, :merchant,
                 :account_name, :amount, :note, null, :fingerprint)
            on conflict (household_id, dedup_fingerprint) do nothing
            returning transaction_id, date, "group", item, type, merchant, account_name,
                      amount, note, source_file
            """
        ),
        {
            "transaction_id": uuid.uuid4(),
            "household_id": session.household_id,
            "date": payload.date,
            "group": payload.group,
            "item": payload.item,
            "type": payload.type,
            "merchant": payload.merchant,
            "account_name": payload.account_name,
            "amount": payload.amount,
            "note": payload.note,
            "fingerprint": fingerprint,
        },
    ).mappings().first()
    if row is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="A transaction with the same date, merchant, amount, and note already exists.",
        )
    return TransactionRead(**row)


@router.get("/export.csv")
def export_transactions_csv(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> Response:
    rows = conn.execute(
        text(
            f'select t.transaction_id, t.date, t."group", t.item, t.type, t.merchant, '
            f'coalesce(tc_item.flow_type, tc_group.flow_type) as flow_type, '
            f't.account_name, t.note, t.source_file {_CATEGORY_JOIN} '
            f"where t.household_id = :household_id order by t.date desc, t.transaction_id"
        ),
        {"household_id": session.household_id},
    ).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["transaction_id", "date", "group", "item", "type", "merchant", "flow_type", "account", "note", "source_file"]
    )
    for row in rows:
        writer.writerow(row)

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=nestworth-transactions.csv"},
    )


@router.get("", response_model=TransactionListResponse)
def list_transactions(
    group: str | None = None,
    item: str | None = None,
    type: str | None = None,
    account_name: str | None = None,
    search: str | None = None,
    start: date | None = None,
    end: date | None = None,
    amount_min: Decimal | None = None,
    amount_max: Decimal | None = None,
    flow_type: str | None = None,
    limit: int = Query(default=200, le=1000),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> TransactionListResponse:
    where = "where t.household_id = :household_id"
    params: dict = {"household_id": session.household_id}

    if group:
        where += ' and t."group" = :group'
        params["group"] = group
    if item:
        where += " and t.item = :item"
        params["item"] = item
    if type:
        where += " and t.type = :type"
        params["type"] = type
    if account_name:
        where += " and t.account_name = :account_name"
        params["account_name"] = account_name
    if search:
        where += " and t.merchant ilike :search"
        params["search"] = f"%{search}%"
    if start:
        where += " and t.date >= :start"
        params["start"] = start
    if end:
        where += " and t.date <= :end"
        params["end"] = end
    if amount_min is not None:
        where += " and t.amount >= :amount_min"
        params["amount_min"] = amount_min
    if amount_max is not None:
        where += " and t.amount <= :amount_max"
        params["amount_max"] = amount_max
    if flow_type:
        where += " and coalesce(tc_item.flow_type, tc_group.flow_type) = :flow_type"
        params["flow_type"] = flow_type

    total = conn.execute(text(f"select count(*) {_CATEGORY_JOIN} {where}"), params).scalar()

    params["limit"] = limit
    params["offset"] = offset
    rows = conn.execute(
        text(
            f'select t.transaction_id, t.date, t."group", t.item, t.type, t.merchant, t.account_name, '
            f't.amount, t.note, t.source_file {_CATEGORY_JOIN} {where} '
            f"order by t.date desc, t.transaction_id limit :limit offset :offset"
        ),
        params,
    ).mappings().all()

    return TransactionListResponse(items=[TransactionRead(**row) for row in rows], total=total)


@router.patch("/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: uuid.UUID,
    payload: TransactionUpdate,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> TransactionRead:
    existing = conn.execute(
        text("select transaction_id from transactions where transaction_id = :id and household_id = :household_id"),
        {"id": transaction_id, "household_id": session.household_id},
    ).first()
    if existing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No fields to update.")

    set_clause = ", ".join(f'"{k}" = :{k}' for k in updates)
    updates["id"] = transaction_id
    row = conn.execute(
        text(
            f'update transactions set {set_clause} where transaction_id = :id '
            f'returning transaction_id, date, "group", item, type, merchant, account_name, '
            f'amount, note, source_file'
        ),
        updates,
    ).mappings().first()
    return TransactionRead(**row)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: uuid.UUID,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    conn.execute(
        text("delete from transactions where transaction_id = :id and household_id = :household_id"),
        {"id": transaction_id, "household_id": session.household_id},
    )


@router.get("/unclassified-summary", response_model=list[UnclassifiedGroup])
def unclassified_summary(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[UnclassifiedGroup]:
    """Distinct expense group/item pairs with no transaction_categories rule yet (neither an
    exact group+item rule nor a group-level default) — drives the Transactions page banner."""
    rows = conn.execute(
        text(
            """
            select coalesce(t."group", '') as "group", coalesce(t.item, '') as item,
                   count(*) as count, sum(-t.amount) as total_amount
            from transactions t
            left join transaction_categories tc_item
                on tc_item.household_id = t.household_id
                and tc_item."group" = coalesce(t."group", '')
                and tc_item.item = coalesce(t.item, '')
            left join transaction_categories tc_group
                on tc_group.household_id = t.household_id
                and tc_group."group" = coalesce(t."group", '')
                and tc_group.item = ''
            where t.household_id = :household_id
                and t.type = 'expense'
                and tc_item.flow_type is null
                and tc_group.flow_type is null
            group by coalesce(t."group", ''), coalesce(t.item, '')
            order by count desc
            """
        ),
        {"household_id": session.household_id},
    ).mappings().all()
    return [UnclassifiedGroup(**row) for row in rows]


@router.get("/all-categories-summary", response_model=list[CategorySummaryRow])
def all_categories_summary(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[CategorySummaryRow]:
    """Every distinct expense group/item pair (classified or not), with its resolved flow_type
    if one exists — powers the Update Transaction Categories page, unlike unclassified-summary
    which only surfaces the gaps."""
    rows = conn.execute(
        text(
            """
            select coalesce(t."group", '') as "group", coalesce(t.item, '') as item,
                   count(*) as count, sum(-t.amount) as total_amount,
                   coalesce(tc_item.flow_type, tc_group.flow_type) as flow_type
            from transactions t
            left join transaction_categories tc_item
                on tc_item.household_id = t.household_id
                and tc_item."group" = coalesce(t."group", '')
                and tc_item.item = coalesce(t.item, '')
            left join transaction_categories tc_group
                on tc_group.household_id = t.household_id
                and tc_group."group" = coalesce(t."group", '')
                and tc_group.item = ''
            where t.household_id = :household_id
                and t.type = 'expense'
            group by coalesce(t."group", ''), coalesce(t.item, ''), coalesce(tc_item.flow_type, tc_group.flow_type)
            order by count desc
            """
        ),
        {"household_id": session.household_id},
    ).mappings().all()
    return [CategorySummaryRow(**row) for row in rows]


@router.get("/categories", response_model=list[TransactionCategoryRule])
def list_transaction_categories(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> list[TransactionCategoryRule]:
    rows = conn.execute(
        text('select "group", item, flow_type from transaction_categories where household_id = :household_id'),
        {"household_id": session.household_id},
    ).mappings().all()
    return [TransactionCategoryRule(**row) for row in rows]


@router.put("/categories", response_model=TransactionCategoryRule)
def upsert_transaction_category(
    payload: TransactionCategoryRule,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> TransactionCategoryRule:
    conn.execute(
        text(
            """
            insert into transaction_categories (household_id, "group", item, flow_type)
            values (:household_id, :group, :item, :flow_type)
            on conflict (household_id, "group", item) do update set flow_type = excluded.flow_type
            """
        ),
        {
            "household_id": session.household_id,
            "group": payload.group,
            "item": payload.item,
            "flow_type": payload.flow_type,
        },
    )
    return payload
