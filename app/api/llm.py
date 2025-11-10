from datetime import date
from decimal import Decimal
from collections.abc import Mapping
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas.transaction import TransactionCreate, TransactionItem, TransactionRead, TransactionType
from ..services import create_transaction, get_receipt_service, get_wallet
from ..services.llm import ReceiptExtractionError
from .dependencies import CurrentUser

router = APIRouter()

SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _parse_transaction_payload(payload: dict, *, user_id: UUID) -> TransactionCreate:
    try:
        transaction_data = payload["transaction"]
    except KeyError as exc:
        raise ReceiptExtractionError("Missing transaction data") from exc

    items_data = payload.get("items") or []
    items = [
        TransactionItem(
            name=item.get("name", "Unknown item"),
            quantity=Decimal(str(item.get("quantity", 1))),
            unit_price=Decimal(str(item.get("unit_price", item.get("total_price", 0)))),
            total_price=Decimal(str(item["total_price"])) if item.get("total_price") else None,
            category=item.get("category"),
        )
        for item in items_data
    ]
    occurred_at_raw = transaction_data.get("occurred_at")
    occurred_at = date.fromisoformat(occurred_at_raw) if occurred_at_raw else date.today()

    tx_type_raw = transaction_data.get("type", TransactionType.EXPENSE.value)
    try:
        tx_type = TransactionType(tx_type_raw)
    except ValueError:
        tx_type = TransactionType.EXPENSE

    return TransactionCreate(
        type=tx_type,
        amount=Decimal(str(transaction_data.get("amount", 0))),
        currency=transaction_data.get("currency", "IDR"),
        description=transaction_data.get("description"),
        category=transaction_data.get("category"),
        occurred_at=occurred_at,
        items=items or None,
        metadata=payload.get("metadata"),
        source="llm",
        user_id=user_id,
    )


@router.post("/receipt", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def parse_receipt_endpoint(
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    commit_transaction: bool = Form(default=True),
    wallet_id: UUID | None = Form(default=None),
) -> TransactionRead | JSONResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    image_bytes = await file.read()
    service = get_receipt_service()
    try:
        payload = await service.parse_receipt(image_bytes)
        transaction_payload = _parse_transaction_payload(payload, user_id=current_user.id)
        if wallet_id:
            wallet = await get_wallet(session, wallet_id)
            if isinstance(wallet, Mapping):
                wallet_owner = wallet.get("user_id")
            else:
                wallet_owner = getattr(wallet, "user_id", None)
            if not wallet or wallet_owner != current_user.id:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Wallet not found")
            transaction_payload = transaction_payload.model_copy(update={"wallet_id": wallet_id})
    except ReceiptExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not commit_transaction:
        preview = transaction_payload.model_dump(mode="json")
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={"transaction": preview, "message": "Preview only, not stored."},
        )

    transaction = await create_transaction(session, transaction_payload)
    return TransactionRead.model_validate(transaction)
