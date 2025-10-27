from fastapi import APIRouter

from . import debts, llm, transactions

api_router = APIRouter()
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(debts.router, prefix="/debts", tags=["debts"])
api_router.include_router(llm.router, prefix="/llm", tags=["llm"])
