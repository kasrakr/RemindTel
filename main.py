import asyncio
import os

from dotenv import load_dotenv
from aiogram import Dispatcher, filters, Bot, F, html
from aiogram.types import (
    Message,
    CallbackQuery,
    FSInputFile,
    ReplyKeyboardMarkup,
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from aiogram.enums import ParseMode, ButtonStyle

from operations import create_table, get_users
from middlewares import Requirements
from filters import isAdmin, Photo
from aiostep import MemoryStateStorage
from aiostep.utils import IsState



states = MemoryStateStorage()

load_dotenv()

dp = Dispatcher()

dp.message.outer_middleware(Requirements())

admins = [int(os.getenv("ADMINS"))]


@dp.message(filters.CommandStart())
async def start(message: Message):
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Help",
                    style=ButtonStyle.PRIMARY,
                    callback_data="help"
                )
            ],
            [
                InlineKeyboardButton(
                    text="Contact Me!",
                    style=ButtonStyle.SUCCESS,
                    callback_data="contact"
                ),
            ],
        ]
    )

    ph = FSInputFile(path="docs/2.png")

    await message.answer_photo(
        photo=ph,
        caption=(
            f"Welcome to RemindTel Bot Dear "
            f"{html.bold(message.from_user.first_name)}!"
        ),
        reply_markup=markup,
        parse_mode=ParseMode.HTML,
    )


@dp.message(F.text == "/broad", isAdmin(admins))
async def boradcast(message: Message):
    await message.answer(
        f"Send your Message Admin {message.from_user.full_name}"
    )
    states.set_state(message.from_user.id, "BRD")


@dp.message(IsState("BRD", states))
async def start_broadcast(message: Message):
    users = await get_users()

    for u in users:
        await message.copy_to(u.user_id)

    await message.answer("Broadcast is Finished")


@dp.callback_query(F.data == "help")
async def Help(call : CallbackQuery):

    await call.bot.send_message(
        chat_id=call.message.chat.id,
        text="For setting your meetings and important date just send it normally i will remind it to you normally:\n" 
        "ex: جلسه با آقای احمدی چهارشنبه ساعت 10",
    )


@dp.message(F.text == "First Button")
async def handleEverything(message: Message):
    await message.reply(text=message.text)


@dp.callback_query(F.data == "btn1")
async def callback(call: CallbackQuery):
    await call.answer(
        text="You clicked on First Button!",
        show_alert=True,
    )

    await call.bot.send_message(
        chat_id=call.message.chat.id,
        text="Successfully Clicked!",
    )


@dp.message(Photo())
async def get_photo(message: Message):
    await message.bot.download(
        message.photo[-1],
        "usersimages/image.jpg",
    )


async def main():
    await create_table()

    bot = Bot(
        token=os.getenv("TELEGRAM_BOT_TOKEN"),
    )

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())