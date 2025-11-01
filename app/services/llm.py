from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import anyio
import google.generativeai as genai
from google.generativeai import types as genai_types

from ..config import get_settings


class ReceiptExtractionError(RuntimeError):
    """Raised when the LLM cannot return valid transaction data."""


class GeminiReceiptService:
    """Thin wrapper around Google's Gemini API for extracting receipt data."""

    def __init__(self, prompt_path: Path | None = None) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        self.prompt = self._load_prompt(prompt_path or settings.llm_receipt_prompt_path)

    @staticmethod
    def _load_prompt(path: Path) -> str:
        if path.exists():
            return path.read_text(encoding="utf-8")
        return (
            "Extract structured transaction data from the provided receipt image. "
            "Return JSON with keys: transaction (type, description, amount, currency, "
            "occurred_at ISO date) and items (list of name, quantity, unit_price, total_price). "
            "If information is missing, use null."
        )

    def _call_model(self, image_bytes: bytes) -> str:
        content: genai_types.ContentDict = [
            {"role": "user", "parts": [{"text": self.prompt}]},
            {"role": "user", "parts": [{"mime_type": "image/jpeg", "data": image_bytes}]},
        ]
        response = self.model.generate_content(content)
        if not response or not response.text:
            raise ReceiptExtractionError("Gemini did not return any text.")
        return response.text

    @staticmethod
    def _clean_model_output(raw_text: str) -> str:
        """Remove Markdown code fences that Gemini may wrap around JSON."""
        text = raw_text.strip()
        if text.startswith("```"):
            first_newline = text.find("\n")
            text = text[first_newline + 1 :] if first_newline != -1 else ""
        if text.endswith("```"):
            text = text[: text.rfind("```")]
        return text.strip()

    async def parse_receipt(self, image_bytes: bytes) -> dict[str, Any]:
        """Send image bytes to Gemini and parse the resulting JSON."""
        raw_text = await anyio.to_thread.run_sync(self._call_model, image_bytes)
        cleaned_text = self._clean_model_output(raw_text)
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError as exc:
            raise ReceiptExtractionError(f"Could not parse Gemini output: {raw_text}") from exc


_service: GeminiReceiptService | None = None


def get_receipt_service() -> GeminiReceiptService:
    global _service
    if _service is None:
        _service = GeminiReceiptService()
    return _service
