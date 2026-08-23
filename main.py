import asyncio
from aiogram import Dispatcher,filters,Bot
from aiogram.types import Message

dp = Dispatcher()

# message handler. can recieve messages #that would be start only with /start
@dp.message(filters.CommandStart())
#aiogram is async so we should write everythings async
async def start(message : Message):
    await message.answer(
        text="Welcome to RemindTel Bot!"
    )

@dp.message(filters.Command("help", prefix='*'))
async def Help(message : Message):
    await message.answer(
        text='How can i help you?'
    )

@dp.message()
async def handleEverything(message : Message):
    await message.reply(text=message.text)

async def main():
    bot = Bot(token='8727753030:AAHsQKrq5bARnr8-4tEP1RdvGaF2UbqLibs')
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())