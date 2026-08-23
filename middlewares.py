from aiogram import BaseMiddleware
from aiogram.types import Message 
from typing import Any, Awaitable, Callable
from operations import get_user, insert_user
class Requirements(BaseMiddleware):
    def __init__(self) -> None: 
        ...

    async def __call__(self,
                        handler: Callable[[Message, dict[str, Any]], Awaitable[Any]],
                        event: Message, 
                        data:dict[str,Any]) -> Any :
         user = await get_user(event.from_user.id)
         if user is None:
            await insert_user(event.from_user.id, event.from_user.full_name, event.from_user.username)
        
         if user and user.is_blocked:
             return
         
         await handler(event, data)