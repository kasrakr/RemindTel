from aiogram import Bot
from aiogram.types import ChatMemberLeft, ChatMemberBanned

# check if user is member of the channel or not?
async def is_join(user_id: int, channels: list[int], bot: Bot) -> bool :
    for ch in channels :
        status = await bot.get_chat_member(ch, user_id)
        if isinstance(status, (ChatMemberLeft,ChatMemberBanned)):
            return False
        
    return True
