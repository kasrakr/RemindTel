import asyncio
import os
from enum import Enum, auto
from dotenv import load_dotenv
from aiogram import Dispatcher,filters,Bot, F, html
from aiogram.types import (Message, CallbackQuery, FSInputFile, 
                           ReplyKeyboardMarkup, KeyboardButton, 
                           InlineKeyboardMarkup, InlineKeyboardButton)
from aiogram.enums import ParseMode
from operations import create_table, get_users
from middlewares import Requirements
from filters import isAdmin, Photo
from aiostep import MemoryStateStorage
from aiostep.utils import IsState

from aiogram.enums import ButtonStyle

states = MemoryStateStorage()
# for loading secret variables from .env
load_dotenv()
dp = Dispatcher()
#for loading and runing middlewares
dp.message.outer_middleware(Requirements())
admins = [int(os.getenv("ADMINS"))]


# message handler. can recieve messages #that would be start only with /start
@dp.message(filters.CommandStart())
#aiogram is async so we should write everythings async
async def start(message : Message):
    markup = ReplyKeyboardMarkup(
        keyboard=[
            # each one of these are keyboard rows.
            [KeyboardButton(text='First Button', style=ButtonStyle.PRIMARY)], #row 1
            [KeyboardButton(text='Second Button',style=ButtonStyle.DANGER), KeyboardButton(text='Third Button',style=ButtonStyle.SUCCESS)] # row 2
        ]
    )

    ph = FSInputFile(path='docs/2.png')

    await message.answer_photo(
        photo=ph,
        caption=f'Welcome to RemindTel Bot Dear {html.bold(message.from_user.first_name)}!',
        # reply markup is for buttons
        reply_markup=markup,
        parse_mode=ParseMode.HTML
    )

# we have also answervideo and answeraudio #


@dp.message(F.text == '/broad', isAdmin(admins))
async def boradcast(message : Message):
    await message.answer(f"Send your Message Admin {message.from_user.full_name}")
    states.set_state(message.from_user.id, "BRD")

@dp.message(IsState("BRD", states))
async def start_broadcast (message : Message):
    users = await get_users()

    for u in users:
        # forward send message with forward tag
        # await message.forward(u.user_id)
        await message.copy_to(u.user_id)

    await message.answer("Broadcast is Finished")



@dp.message(filters.Command("help", prefix='*'))
async def Help(message : Message):
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text='First Button', callback_data='btn1')],
            [InlineKeyboardButton(text='Second Button', callback_data='btn2'), InlineKeyboardButton(text='Third Button', callback_data='btn3')],
            [InlineKeyboardButton(text='Fourth Button', url='https://t.me/lowkasra')],
        ]
    )
    await message.answer(
        text='How can i help you?',
        reply_markup= markup
    )



@dp.message(F.text == 'First Button')
async def handleEverything(message : Message):
    # user info
    # message.from_user.first_name
    #chat info
    # message.chat.id

    await message.reply(text=message.text)



@dp.callback_query(F.data == 'btn1')
async def callback(call : CallbackQuery):
    # user info
    # call.from_user.first_name

    await call.answer(
        text='You clicked on First Button!',
        show_alert=True
        )

    # sending message via bot chat id is necessary
    await call.bot.send_message(
        chat_id=call.message.chat.id,
        text='Successfully Clicked!'
    )


@dp.message(Photo())
async def get_photo(message: Message):
    #[-1] means save in highest quality
    await message.bot.download(message.photo[-1], "usersimages/image.jpg")




async def main():
    await create_table()
    bot = Bot(os.getenv("TELEGRAM_BOT_TOKEN"))
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())