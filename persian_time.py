from __future__ import annotations

import re
from datetime import datetime, timedelta


_PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")

_WEEKDAYS: dict[str, int] = {
    "شنبه": 5,
    "یک شنبه": 6,
    "یکشنبه": 6,
    "یک‌شنبه": 6,
    "دو شنبه": 0,
    "دوشنبه": 0,
    "دو‌شنبه": 0,
    "سه شنبه": 1,
    "سه‌شنبه": 1,
    "چهار شنبه": 2,
    "چهارشنبه": 2,
    "چهار‌شنبه": 2,
    "پنج شنبه": 3,
    "پنجشنبه": 3,
    "پنج‌شنبه": 3,
    "جمعه": 4,
    "آخر هفته": 4,
    "آخرهفته": 4,
}
_WEEKDAYS_SORTED = sorted(_WEEKDAYS.items(), key=lambda kv: -len(kv[0]))

_RELATIVE_DAYS: dict[str, int] = {
    "پس فردا": 2,
    "پس‌فردا": 2,
    "پسفردا": 2,
    "فردا": 1,
    "امروز": 0,
    "امشب": 0,
}
_RELATIVE_DAYS_SORTED = sorted(_RELATIVE_DAYS.items(), key=lambda kv: -len(kv[0]))


_DEFAULT_HOUR_FOR_WORD = {
    "امشب": 21,
}

_PERIOD_WORDS = ["بعدازظهر", "بعد از ظهر", "صبح", "ظهر", "عصر", "شب"]
_PERIOD_RE = "|".join(sorted(_PERIOD_WORDS, key=lambda w: -len(w)))

_PERSIAN_HOUR_WORDS: dict[str, int] = {
    "یک": 1,
    "دو": 2,
    "سه": 3,
    "چهار": 4,
    "پنج": 5,
    "شش": 6,
    "هفت": 7,
    "هشت": 8,
    "نه": 9,
    "ده": 10,
    "یازده": 11,
    "دوازده": 12,
}
_PERSIAN_HOUR_RE = "|".join(
    sorted(_PERSIAN_HOUR_WORDS, key=lambda w: -len(w))
)
_HOUR_RE = rf"(?:\d{{1,2}}|{_PERSIAN_HOUR_RE})"

_TIME_RE = re.compile(
    rf"(?:({_PERIOD_RE})\s+)?ساعت\s*({_HOUR_RE})(?::(\d{{2}}))?"
    rf"(?:\s*(و)?\s*(نیم|ربع))?"
    rf"\s*({_PERIOD_RE})?"
)


_TO_QUARTER_RE = re.compile(
    rf"(?:یک\s+)?ربع\s+به\s+({_HOUR_RE})"
)

_HALF_AFTER_RE = re.compile(
    rf"نیم\s+ساعت\s+بعد(?:\s+از)?\s+(?:ساعت\s+)?({_HOUR_RE})"
)

_HOUR_AND_HALF_RE = re.compile(
    rf"(?:ساعت\s+)?({_HOUR_RE})\s+و\s+نیم"
)

_STANDALONE_PERIOD_RE = re.compile(_PERIOD_RE)

_DEFAULT_HOUR_FOR_PERIOD = {
    "صبح": 9,
    "ظهر": 12,
    "عصر": 17,
    "بعدازظهر": 16,
    "بعد از ظهر": 16,
    "شب": 21,
}

_FILLER_WORDS = [
    "برای",
    "در",
    "روز",
    "ساعت",
    "حدود",
    "تقریبا",
    "تقریباً",
]


def _normalize(text: str) -> str:
    return text.translate(_PERSIAN_DIGITS)


def _hour_from_token(token: str) -> int:
    token = token.strip()
    if token in _PERSIAN_HOUR_WORDS:
        return _PERSIAN_HOUR_WORDS[token]
    return int(token)


def _apply_period(hour: int, period: str | None) -> int:
    period = (period or "").replace(" ", "").replace("‌", "")
    if period == "صبح":
        return 0 if hour == 12 else hour
    if period == "ظهر":
        return 12
    if period in ("عصر", "بعدازظهر"):
        return hour + 12 if hour < 12 else hour
    if period == "شب":
        if hour == 12:
            return 0
        return hour + 12 if hour < 12 else hour
    return hour


def _guess_hour_without_period(hour: int) -> int:
    if hour == 0 or hour == 12:
        return hour if hour != 0 else 0
    if 7 <= hour <= 11:
        return hour
    if 1 <= hour <= 6:
        return hour + 12
    return hour


def _natural_hour(hour: int) -> int:
    """Apply the bot's existing AM/PM guess to a natural-language hour."""
    return _guess_hour_without_period(hour)


def _strip_spans(text: str, spans: list[tuple[int, int]]) -> str:
    spans = sorted(spans, key=lambda s: s[0])
    out = []
    last = 0
    for start, end in spans:
        out.append(text[last:start])
        last = max(last, end)
    out.append(text[last:])
    cleaned = "".join(out)

    for w in _FILLER_WORDS:
        cleaned = re.sub(rf"(?:^|\s){re.escape(w)}(?=\s|$)", " ", cleaned)

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" \t\n\r،,.:؛-")
    return cleaned



def parse_reminder(
    text: str, now: datetime | None = None
) -> tuple[str, datetime] | None:

    if now is None:
        now = datetime.now()

    working = _normalize(text)
    spans: list[tuple[int, int]] = []

    target_date = None
    matched_day_word: str | None = None
    is_weekday_match = False

    for word, offset in _RELATIVE_DAYS_SORTED:
        idx = working.find(word)
        if idx != -1:
            target_date = (now + timedelta(days=offset)).date()
            matched_day_word = word
            spans.append((idx, idx + len(word)))
            break

    if target_date is None:
        for word, weekday in _WEEKDAYS_SORTED:
            idx = working.find(word)
            if idx != -1:
                days_ahead = (weekday - now.weekday()) % 7
                target_date = (now + timedelta(days=days_ahead)).date()
                matched_day_word = word
                is_weekday_match = True
                spans.append((idx, idx + len(word)))
                break

    hour: int | None = None
    minute = 0

    # 1) «یک ربع به سه» / «ربع به سه»
    m = _TO_QUARTER_RE.search(working)
    if m:
        base_hour = _natural_hour(_hour_from_token(m.group(1)))
        total_minutes = base_hour * 60 - 15
        hour, minute = divmod(total_minutes, 60)
        spans.append((m.start(), m.end()))

    # 2) «نیم ساعت بعد از دو» / «نیم ساعت بعد دو»
    if hour is None:
        m = _HALF_AFTER_RE.search(working)
        if m:
            base_hour = _natural_hour(_hour_from_token(m.group(1)))
            total_minutes = base_hour * 60 + 30
            hour, minute = divmod(total_minutes, 60)
            spans.append((m.start(), m.end()))

    # 3) «سه و نیم» / «ساعت سه و نیم»
    if hour is None:
        m = _HOUR_AND_HALF_RE.search(working)
        if m:
            hour = _natural_hour(_hour_from_token(m.group(1)))
            minute = 30
            spans.append((m.start(), m.end()))

    # 4) Existing explicit «ساعت ...» parser.
    if hour is None:
        m = _TIME_RE.search(working)
        if m:
            hour = _hour_from_token(m.group(2))

            if m.group(3):
                minute = int(m.group(3))
            elif m.group(5) == "نیم":
                minute = 30
            elif m.group(5) == "ربع":
                minute = 15

            period = m.group(6) or m.group(1)
            if period:
                hour = _apply_period(hour, period)
            else:
                hour = _guess_hour_without_period(hour)

            spans.append((m.start(), m.end()))

    # 5) A standalone period such as «فردا شب».
    if hour is None:
        pm = _STANDALONE_PERIOD_RE.search(working)
        if pm:
            period = pm.group(0)
            hour = _DEFAULT_HOUR_FOR_PERIOD.get(period.replace(" ", ""), 9)
            spans.append((pm.start(), pm.end()))

    if target_date is None and hour is None:
        return None

    if target_date is None:
        target_date = now.date()

    if hour is None:
        hour = _DEFAULT_HOUR_FOR_WORD.get(matched_day_word or "", 9)

    remind_at = datetime.combine(target_date, datetime.min.time()).replace(
        hour=hour, minute=minute
    )

    if remind_at <= now and target_date == now.date():
        if is_weekday_match:
            remind_at += timedelta(days=7)
        else:
            remind_at += timedelta(days=1)

    description = _strip_spans(working, spans)
    if not description:
        description = "یادآوری"

    return description, remind_at
