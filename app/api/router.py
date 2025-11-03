from fastapi import APIRouter

from . import debts, llm, telegram, transactions, users, wallets

api_router = APIRouter()
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(debts.router, prefix="/debts", tags=["debts"])
api_router.include_router(llm.router, prefix="/llm", tags=["llm"])
api_router.include_router(telegram.router, prefix="/telegram", tags=["telegram"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(wallets.router, prefix="/wallets", tags=["wallets"])
