import asyncio
import os

from dotenv import load_dotenv
from aiogram import Dispatcher, filters, Bot, F, html
from aiogram.types import Message, CallbackQuery, FSInputFile, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, ReactionTypeEmoji
from aiogram.enums import ParseMode, ButtonStyle

from operations import create_table, get_users, insert_reminder, get_user, get_user_reminders, delete_reminder, set_user_language
from middlewares import Requirements
from filters import isAdmin
from aiostep import MemoryStateStorage
from aiostep.utils import IsState
from persian_time import parse_reminder
from llm_parser import parse_reminder_with_llm
from scheduler import schedule_reminder, load_pending_reminders, start_scheduler, cancel_reminder
from i18n import TEXTS, t

states = MemoryStateStorage()
load_dotenv()
dp = Dispatcher()
dp.message.outer_middleware(Requirements())
admins = [int(os.getenv("ADMINS"))]


def lang_of(user) -> str:
    return getattr(user, "language", "en") if user else "en"


def menu(lang: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=t(lang, "my_reminders"), style=ButtonStyle.PRIMARY), KeyboardButton(text=t(lang, "help"), style=ButtonStyle.PRIMARY)],
            [KeyboardButton(text=t(lang, "contact"), style=ButtonStyle.DANGER), KeyboardButton(text=t(lang, "language_button"), style=ButtonStyle.SUCCESS)],
        ],
        resize_keyboard=True,
    )


def language_markup() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🇮🇷 فارسی", callback_data="lang:fa"), InlineKeyboardButton(text="🇬🇧 English", callback_data="lang:en")]])


def format_when(dt, lang: str) -> str:
    return f"{TEXTS[lang]['weekday'][dt.weekday()]} {dt.strftime('%Y-%m-%d %H:%M')}"


def reminders_markup(reminders, lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=t(lang, "delete", id=r.id), callback_data=f"delete_reminder:{r.id}")] for r in reminders])


async def show_user_reminders(message: Message, lang: str):
    reminders = await get_user_reminders(message.from_user.id)
    if not reminders:
        await message.answer(t(lang, "no_reminders"), reply_markup=menu(lang))
        return
    text = t(lang, "reminders_title") + "\n\n"
    for r in reminders:
        text += f"🆔 #{r.id}\n📝 {r.text}\n🗓 {format_when(r.remind_at, lang)}\n\n"
    await message.answer(text, reply_markup=reminders_markup(reminders, lang))


@dp.message(filters.CommandStart())
async def start(message: Message):
    user = await get_user(message.from_user.id)
    lang = lang_of(user)
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(lang, "help"), callback_data="help")],
        [InlineKeyboardButton(text=t(lang, "language_button"), callback_data="language")],
        [InlineKeyboardButton(text=t(lang, "contact"), callback_data="contact")],
    ])
    await message.answer_photo(FSInputFile(path="docs/2.png"), caption=t(lang, "welcome", name=html.bold(message.from_user.first_name)), reply_markup=markup, parse_mode=ParseMode.HTML)
    await message.answer(t(lang, "menu_ready"), reply_markup=menu(lang))


@dp.message(F.text == "/broad", isAdmin(admins))
async def broadcast(message: Message):
    await message.answer(f"Send your Message Admin {message.from_user.full_name}")
    states.set_state(message.from_user.id, "BRD")


@dp.message(IsState("BRD", states))
async def start_broadcast(message: Message):
    for user in await get_users():
        await message.copy_to(user.user_id)
    await message.answer("Broadcast is Finished")


@dp.callback_query(F.data == "language")
async def language_callback(call: CallbackQuery):
    await call.message.answer("🌐 / زبان", reply_markup=language_markup())
    await call.answer()


@dp.message(F.text.in_({"🌐 تغییر زبان", "🌐 Change language"}))
async def language_message(message: Message):
    await message.answer("🌐 / زبان", reply_markup=language_markup())


@dp.callback_query(F.data.startswith("lang:"))
async def set_language(call: CallbackQuery):
    language = call.data.split(":", 1)[1]
    if language not in {"fa", "en"}:
        await call.answer("Invalid language", show_alert=True)
        return
    await set_user_language(call.from_user.id, language)
    await call.answer()
    await call.message.answer(t(language, "language_changed") if language == "fa" else t("en", "language_changed_en"), reply_markup=menu(language))


@dp.message(F.text.in_({"راهنما❓", "❓ Help"}))
async def help_message(message: Message):
    user = await get_user(message.from_user.id)
    lang = lang_of(user)
    await message.answer(t(lang, "help_text"), reply_markup=menu(lang))


@dp.callback_query(F.data == "help")
async def help_callback(call: CallbackQuery):
    user = await get_user(call.from_user.id)
    lang = lang_of(user)
    await call.message.answer(t(lang, "help_text"), reply_markup=menu(lang))
    await call.answer()


@dp.message(F.text.in_({"تماس📞", "📞 Contact"}))
async def contact_message(message: Message):
    user = await get_user(message.from_user.id)
    lang = lang_of(user)
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Telegram", url="https://t.me/Lowkasra", style=ButtonStyle.PRIMARY)],
        [InlineKeyboardButton(text="LinkedIn", url="https://www.linkedin.com/in/kasrakarimian/", style=ButtonStyle.SUCCESS)],
        [InlineKeyboardButton(text="GitHub", url="https://github.com/kasrakr")],
        [InlineKeyboardButton(text="Buy Me a Coffee!", url="https://coffeebede.com/highkasra", style=ButtonStyle.DANGER)],
    ])
    await message.answer(t(lang, "contact_text"), reply_markup=markup)


@dp.callback_query(F.data == "contact")
async def contact_callback(call: CallbackQuery):
    user = await get_user(call.from_user.id)
    lang = lang_of(user)
    await call.message.answer(t(lang, "contact_text"))
    await call.answer()


@dp.message(F.text.in_({"یادآوری های من⏱️", "⏱️ My Reminders"}))
async def showreminders(message: Message):
    user = await get_user(message.from_user.id)
    await show_user_reminders(message, lang_of(user))


@dp.callback_query(F.data.startswith("delete_reminder:"))
async def ask_delete_reminder(call: CallbackQuery):
    user = await get_user(call.from_user.id)
    lang = lang_of(user)
    try:
        reminder_id = int(call.data.split(":", 1)[1])
    except (ValueError, AttributeError):
        await call.answer(t(lang, "invalid_reminder"), show_alert=True)
        return
    markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=t(lang, "yes_delete"), callback_data=f"confirm_delete:{reminder_id}"), InlineKeyboardButton(text=t(lang, "cancel"), callback_data="cancel_delete")]])
    await call.message.answer(t(lang, "confirm_delete", id=reminder_id), reply_markup=markup)
    await call.answer()


@dp.callback_query(F.data.startswith("confirm_delete:"))
async def confirm_delete_reminder(call: CallbackQuery):
    user = await get_user(call.from_user.id)
    lang = lang_of(user)
    try:
        reminder_id = int(call.data.split(":", 1)[1])
    except (ValueError, AttributeError):
        await call.answer(t(lang, "invalid_reminder"), show_alert=True)
        return
    if not await delete_reminder(reminder_id, call.from_user.id):
        await call.answer(t(lang, "not_found"), show_alert=True)
        return
    await cancel_reminder(reminder_id)
    await call.answer(t(lang, "deleted"))
    try:
        await call.message.delete()
    except Exception:
        pass
    reminders = await get_user_reminders(call.from_user.id)
    if reminders:
        text = t(lang, "reminders_title") + "\n\n" + "".join(f"🆔 #{r.id}\n📝 {r.text}\n🗓 {format_when(r.remind_at, lang)}\n\n" for r in reminders)
        await call.bot.send_message(call.message.chat.id, text, reply_markup=reminders_markup(reminders, lang))
    else:
        await call.bot.send_message(call.message.chat.id, t(lang, "no_reminders"), reply_markup=menu(lang))


@dp.callback_query(F.data == "cancel_delete")
async def cancel_delete(call: CallbackQuery):
    user = await get_user(call.from_user.id)
    await call.answer(t(lang_of(user), "cancelled"))
    try:
        await call.message.delete()
    except Exception:
        pass


@dp.message(F.text, ~F.text.startswith("/"))
async def set_reminder(message: Message):
    user = await get_user(message.from_user.id)
    lang = lang_of(user)
    parsed = await parse_reminder_with_llm(message.text)
    if parsed is None:
        parsed = parse_reminder(message.text)
    if parsed is None:
        await message.answer(t(lang, "parse_error"), reply_markup=menu(lang))
        return
    description, remind_at = parsed
    reminder = await insert_reminder(message.from_user.id, message.chat.id, description, remind_at)
    await schedule_reminder(message.bot, reminder)
    await message.react(reaction=[ReactionTypeEmoji(emoji="❤️‍🔥")])
    await message.answer(t(lang, "scheduled", description=description, when=format_when(remind_at, lang)), reply_markup=menu(lang))


async def main():
    await create_table()
    bot = Bot(token=os.getenv("TELEGRAM_BOT_TOKEN"))
    start_scheduler()
    await load_pending_reminders(bot)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
