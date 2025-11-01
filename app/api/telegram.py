from fastapi import APIRouter, HTTPException, Request, status

from ..config import get_settings
from ..telegram.bot import handle_update

router = APIRouter()


def verify_secret(secret: str) -> None:
    settings = get_settings()
    if not settings.telegram_webhook_secret or secret != settings.telegram_webhook_secret:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


@router.post("/webhook/{secret}", status_code=status.HTTP_204_NO_CONTENT)
async def telegram_webhook(secret: str, request: Request) -> None:
    verify_secret(secret)
    payload = await request.json()
    await handle_update(payload)
