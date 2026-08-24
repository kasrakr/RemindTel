from __future__ import annotations

import json
import os
from datetime import datetime

from openai import AsyncOpenAI


_SYSTEM_PROMPT = """
You are the natural-language date/time parser for a Telegram reminder bot.
Understand Persian and English naturally written reminder requests.

Your only job is to extract a reminder description and an exact local datetime.
Return JSON only, matching the provided schema.

Rules:
- The current local datetime is provided by the application. Use it as the reference for relative dates/times.
- Resolve words such as today, tomorrow, tonight, next Monday, فردا، امشب، پس فردا and Persian weekdays.
- Understand natural time expressions such as:
  - یک ربع به سه / a quarter to three -> 14:45 under the bot's usual 12-hour inference.
  - سه و نیم / half past three -> 15:30 under the bot's usual 12-hour inference.
  - نیم ساعت بعد از دو / half an hour after two -> 14:30.
  - حدود ساعت پنج / around five -> 17:00 under the bot's usual 12-hour inference.
  - in two hours / دو ساعت دیگه -> current time + 2 hours.
- If morning/evening/afternoon/night is explicit, respect it.
- For bare hours 1-6, use afternoon/evening (13:00-18:00) to match the existing bot behavior.
- For bare hours 7-11, use morning.
- For 12, use 12:00 unless a period changes it.
- Preserve the user's reminder text as the description, but remove only the scheduling words when practical.
- If there is not enough information to produce a reliable reminder datetime, set intent to "unknown".
- Never invent a date or time that cannot reasonably be inferred.
""".strip()


_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["create_reminder", "unknown"],
        },
        "description": {"type": "string"},
        "remind_at": {
            "type": "string",
            "description": "ISO 8601 local datetime, without timezone offset",
        },
    },
    "required": ["intent", "description", "remind_at"],
    "additionalProperties": False,
}


async def parse_reminder_with_llm(
    text: str,
    now: datetime | None = None,
) -> tuple[str, datetime] | None:
    """Parse a reminder with an LLM. Returns None when unavailable/uncertain."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    if now is None:
        now = datetime.now()

    client = AsyncOpenAI(api_key=api_key)
    model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")

    user_prompt = (
        f"Current local datetime: {now.isoformat(timespec='minutes')}\n"
        f"User timezone is local to the bot server.\n"
        f"User message: {text}"
    )

    try:
        response = await client.responses.create(
            model=model,
            input=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "reminder_parse",
                    "strict": True,
                    "schema": _SCHEMA,
                }
            },
        )

        raw = response.output_text.strip()
        data = json.loads(raw)

        if data.get("intent") != "create_reminder":
            return None

        description = str(data.get("description", "")).strip()
        remind_at_raw = str(data.get("remind_at", "")).strip()

        if not description or not remind_at_raw:
            return None

        remind_at = datetime.fromisoformat(remind_at_raw)

        if not 0 <= remind_at.hour <= 23 or not 0 <= remind_at.minute <= 59:
            return None

        return description, remind_at

    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    except Exception:
        # API/network/model errors must not take the Telegram bot down.
        return None
