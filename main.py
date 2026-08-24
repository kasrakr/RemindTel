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
    ReactionTypeEmoji
)
from aiogram.enums import ParseMode, ButtonStyle

from operations import (
    create_table,
    get_users,
    insert_reminder,
    get_user_reminders,
    delete_reminder,
)
from middlewares import Requirements
from filters import isAdmin
from aiostep import MemoryStateStorage
from aiostep.utils import IsState
from persian_time import parse_reminder
from scheduler import (
    schedule_reminder,
    load_pending_reminders,
    start_scheduler,
    cancel_reminder,
)


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
                    text="راهنما❓",
                    style=ButtonStyle.PRIMARY,
                    callback_data="help"
                )
            ],
            [
                InlineKeyboardButton(
                    text="تماس📞",
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
            f"به ربات RrmindTel خوش آمدید "
            f"{html.bold(message.from_user.first_name)} عزیز!"
        ),
        reply_markup=markup,
        parse_mode=ParseMode.HTML,
    )
    reply_markup = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="/start", style=ButtonStyle.SUCCESS),
                KeyboardButton(text="یادآوری های من⏱️", style=ButtonStyle.PRIMARY),
                KeyboardButton(text="تماس📞", style=ButtonStyle.DANGER),
            ]
        ],
        resize_keyboard=True
    )
    await message.answer(
        text='',
        reply_markup=reply_markup
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
async def Help(call: CallbackQuery):
    await call.bot.send_message(
        chat_id=call.message.chat.id,
        text="⚪برای تنظیم کردن قرارها و یادآور ها فقط یک متن عادی با ساعت و  روز برام بفرست.\n\n"
        "مثال: جلسه با آقای احمدی چهارشنبه ساعت 10✅\n\n"
        "Currrently only works with Persian language. English is comming on later updates.",
    )
    await call.answer()


@dp.message(F.text == "تماس📞")
async def contact_message(message:Message):
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Telegram", url="https://t.me/Lowkasra", style=ButtonStyle.PRIMARY)],
            [InlineKeyboardButton(text="Linkedin", url="https://www.linkedin.com/in/kasrakarimian/", style=ButtonStyle.SUCCESS)],
            [InlineKeyboardButton(text="GitHub", url="https://github.com/kasrakr")],
            [InlineKeyboardButton(text="Buy Me a Coffee!", url="https://coffeebede.com/highkasra", style=ButtonStyle.DANGER)],
        ]
    )
    await message.answer(
        text="خوشحال میشم نظراتت رو ببینم:",
        reply_markup=markup
    )



@dp.callback_query(F.data == "contact")
async def contact(call: CallbackQuery):
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Telegram", url="https://t.me/Lowkasra", style=ButtonStyle.PRIMARY)],
            [InlineKeyboardButton(text="Linkedin", url="https://www.linkedin.com/in/kasrakarimian/", style=ButtonStyle.SUCCESS)],
            [InlineKeyboardButton(text="GitHub", url="https://github.com/kasrakr")],
            [InlineKeyboardButton(text="Buy Me a Coffee!", url="https://coffeebede.com/highkasra", style=ButtonStyle.DANGER)],
        ]
    )
    await call.bot.send_message(
        chat_id=call.message.chat.id,
        text="خوشحال میشم نظراتت رو ببینم:",
        reply_markup=markup
    )
    await call.answer()

_PERSIAN_WEEKDAY_NAMES = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"]


def _format_when(dt) -> str:
    return f"{_PERSIAN_WEEKDAY_NAMES[dt.weekday()]} {dt.strftime('%Y-%m-%d')} ساعت {dt.strftime('%H:%M')}"


def _reminders_markup(reminders) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=f"🗑 حذف #{reminder.id}",
                    callback_data=f"delete_reminder:{reminder.id}",
                )
            ]
            for reminder in reminders
        ]
    )


async def _show_user_reminders(message: Message) -> None:
    reminders = await get_user_reminders(message.from_user.id)

    if not reminders:
        await message.answer("⏱️ شما هیچ یادآوری‌ای ندارید.")
        return

    text = "📋 یادآوری‌های شما:\n\n"

    for reminder in reminders:
        text += (
            f"🆔 #{reminder.id}\n"
            f"📝 {reminder.text}\n"
            f"🗓 {_format_when(reminder.remind_at)}\n\n"
        )

    await message.answer(
        text,
        reply_markup=_reminders_markup(reminders),
    )


@dp.message(F.text == "یادآوری های من⏱️")
async def showreminders(message: Message):
    await _show_user_reminders(message)


@dp.callback_query(F.data.startswith("delete_reminder:"))
async def ask_delete_reminder(call: CallbackQuery):
    try:
        reminder_id = int(call.data.split(":", 1)[1])
    except (ValueError, AttributeError):
        await call.answer("یادآوری نامعتبر است.", show_alert=True)
        return

    confirm_markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ بله، حذفش کن",
                    callback_data=f"confirm_delete:{reminder_id}",
                ),
                InlineKeyboardButton(
                    text="❌ لغو",
                    callback_data="cancel_delete",
                ),
            ]
        ]
    )

    await call.message.answer(
        f"⚠️ مطمئنی می‌خواهی یادآوری #{reminder_id} حذف شود؟",
        reply_markup=confirm_markup,
    )
    await call.answer()


@dp.callback_query(F.data.startswith("confirm_delete:"))
async def confirm_delete_reminder(call: CallbackQuery):
    try:
        reminder_id = int(call.data.split(":", 1)[1])
    except (ValueError, AttributeError):
        await call.answer("یادآوری نامعتبر است.", show_alert=True)
        return

    deleted = await delete_reminder(
        reminder_id=reminder_id,
        user_id=call.from_user.id,
    )

    if not deleted:
        await call.answer("این یادآوری پیدا نشد یا متعلق به شما نیست.", show_alert=True)
        return

    await cancel_reminder(reminder_id)
    await call.answer("یادآوری حذف شد ✅")

    if call.message:
        try:
            await call.message.delete()
        except Exception:
            pass

    if call.message:
        reminders = await get_user_reminders(call.from_user.id)
        if reminders:
            text = "📋 یادآوری‌های شما:\n\n"
            for reminder in reminders:
                text += (
                    f"🆔 #{reminder.id}\n"
                    f"📝 {reminder.text}\n"
                    f"🗓 {_format_when(reminder.remind_at)}\n\n"
                )
            await call.bot.send_message(
                chat_id=call.message.chat.id,
                text=text,
                reply_markup=_reminders_markup(reminders),
            )
        else:
            await call.bot.send_message(
                chat_id=call.message.chat.id,
                text="⏱️ شما هیچ یادآوری‌ای ندارید.",
            )


@dp.callback_query(F.data == "cancel_delete")
async def cancel_delete(call: CallbackQuery):
    await call.answer("حذف لغو شد.")
    if call.message:
        try:
            await call.message.delete()
        except Exception:
            pass


@dp.message(F.text, ~F.text.startswith("/"))
async def set_reminder(message: Message):
    parsed = parse_reminder(message.text)

    if parsed is None:
        await message.answer(
            "متوجه روز و ساعت پیام شما نشدم 🙁\n"
            "لطفاً یک روز هفته یا «امروز/فردا» و یک ساعت مشخص کنید.\n"
            "مثال: جلسه با آقای احمدی چهارشنبه ساعت 10"
        )
        return

    description, remind_at = parsed

    reminder = await insert_reminder(
        user_id=message.from_user.id,
        chat_id=message.chat.id,
        text=description,
        remind_at=remind_at,
    )

    await schedule_reminder(message.bot, reminder)

    await message.react(
        reaction=[
            ReactionTypeEmoji(emoji="❤️‍🔥")
        ]
    )
    await message.answer(
        f"✅ یادآوری تنظیم شد:\n"
        f"📝 {description}\n"
        f"🗓 {_format_when(remind_at)}"
    )


async def main():
    await create_table()

    bot = Bot(
        token=os.getenv("TELEGRAM_BOT_TOKEN"),
    )

    start_scheduler()
    await load_pending_reminders(bot)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
