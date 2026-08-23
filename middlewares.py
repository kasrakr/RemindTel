from aiogram import BaseMiddleware
from aiogram.types import Message, InlineKeyboardButton, InlineKeyboardMarkup
from typing import Any, Awaitable, Callable
from operations import get_user, insert_user

from utils import is_join
channels = [-1004470209369]

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
            user = await get_user(event.from_user.id)

    
         if user and user.is_blocked:
             return

         if await is_join(event.from_user.id, channels, event.bot) is False:
             markup = InlineKeyboardMarkup(
                 inline_keyboard=[ [InlineKeyboardButton(text="Test Channel", url="https://t.me/kanaltest123123")]]
                              )
                
             await event.answer(text="You must join These channels First: ", reply_markup=markup)
             return
             
         
         return await handler(event, data)