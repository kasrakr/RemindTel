from aiogram import BaseMiddleware
from typing import Any, Awaitable, Callable
from operations import get_user, insert_user


class Requirements(BaseMiddleware):
    def __init__(self) -> None:
        pass

    async def __call__(
        self,
        handler: Callable[[Any, dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: dict[str, Any],
    ) -> Any:
        user = await get_user(event.from_user.id)

        if user is None:
            telegram_language = (getattr(event.from_user, "language_code", None) or "").lower()
            language = "fa" if telegram_language.startswith("fa") else "en"
            await insert_user(
                event.from_user.id,
                event.from_user.full_name,
                event.from_user.username,
                language=language,
            )
            user = await get_user(event.from_user.id)

        if user and user.is_blocked:
            return

        return await handler(event, data)
