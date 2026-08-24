from __future__ import annotations

import json
import os
from datetime import datetime

from openai import AsyncOpenAI


_SYSTEM_PROMPT = """
You are the semantic natural-language parser for a Telegram reminder bot.
Your job is NOT to reply to the user. Your job is to understand the user's
sentence in Persian or English and convert it into one precise reminder.

IMPORTANT:
- Prefer semantic understanding over keyword matching.
- The application provides the current local datetime. Use it as the reference.
- Return a reminder only when the requested time can be reasonably inferred.
- Never let scheduling words become part of the reminder description.
- Preserve the actual activity/task in the description, in the user's language.
- Resolve Persian natural language, colloquial wording, half-spaces, and spelling variants.

DATE/TIME UNDERSTANDING:
- امروز, فردا, پس فردا, امشب, فردا شب, هفته بعد, شنبه بعد, دوشنبه آینده, etc.
- Relative expressions: «دو ساعت دیگه», «نیم ساعت بعد», «سه روز دیگه», «دو روز قبل از...», etc.
- Natural clock expressions: «سه و نیم», «یک ربع به سه», «ربع بعد از دو», «حدود پنج», «نزدیک ساعت شش», etc.
- Explicit periods: صبح, ظهر, عصر, بعدازظهر, شب.
- Bare hours 1-6 usually mean afternoon/evening to match the bot's existing behavior.
- Bare hours 7-11 usually mean morning.
- 12 means noon unless context changes it.

PERSIAN DATE REFERENCES:
Understand semantic calendar references such as:
- «روز قبل عید قربان» = the calendar day immediately before Eid al-Adha.
- «روز بعد عید قربان» = the day immediately after Eid al-Adha.
- «شب قبل عید», «دو روز مونده به عید», «سه روز بعد امتحان», etc.
- Recognize common Persian religious/national holiday names when their date
  can be reliably inferred. Do not fabricate an obscure date.
- A phrase such as «روز قبل عید قربان ساعت 9 میخوام برم فوتبال» means the
  reminder activity is «برم فوتبال», while «روز قبل عید قربان ساعت 9» is the
  scheduling information and must NOT appear in the description.

DESCRIPTION EXTRACTION:
Examples:
- «روز قبل عید قربان ساعت 9 میخوام برم فوتبال» -> description: «برم فوتبال»
- «فردا ساعت پنج به علی زنگ بزن» -> description: «به علی زنگ بزن»
- «سه شنبه ساعت 10 جلسه با احمد» -> description: «جلسه با احمد»
- «Remind me tomorrow at 5 PM to call Sara» -> description: «call Sara»

When uncertain about a date reference, return intent="unknown" instead of
silently converting the user's text into today's/ tomorrow's date.
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
            "description": "ISO 8601 local datetime without timezone offset",
        },
    },
    "required": ["intent", "description", "remind_at"],
    "additionalProperties": False,
}


async def parse_reminder_with_llm(
    text: str,
    now: datetime | None = None,
) -> tuple[str, datetime] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    if now is None:
        now = datetime.now()

    client = AsyncOpenAI(
        api_key=api_key,
    )
    model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")

    user_prompt = (
        f"Current local datetime: {now.isoformat(timespec='minutes')}\n"
        "The datetime above is the reference clock for this request.\n"
        "Return the exact local datetime represented by the user.\n"
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
