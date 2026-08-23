import asyncio
import os
from dotenv import load_dotenv
from aiogram import Dispatcher,filters,Bot, F
from aiogram.types import (Message, CallbackQuery, FSInputFile, 
                           ReplyKeyboardMarkup, KeyboardButton, 
                           InlineKeyboardMarkup, InlineKeyboardButton)

load_dotenv()
dp = Dispatcher()

# message handler. can recieve messages #that would be start only with /start
@dp.message(filters.CommandStart())
#aiogram is async so we should write everythings async
async def start(message : Message):
    markup = ReplyKeyboardMarkup(
        keyboard=[
            # each one of these are keyboard rows.
            [KeyboardButton(text='First Button')], #row 1
            [KeyboardButton(text='Second Button'), KeyboardButton(text='Third Button')] # row 2
        ]
    )
    ph = FSInputFile(path='docs/2.png')
    await message.answer_photo(
        photo=ph,
        caption='Welcome to RemindTel Bot!',
        # reply markup is for buttons
        reply_markup=markup
    )

# we have also answervideo and answeraudio #

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
    await message.reply(text=message.text)

@dp.callback_query()
async def callback(call : CallbackQuery):
    print(call)

async def main():
    bot = Bot(os.getenv("TELEGRAM_BOT_TOKEN"))
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())