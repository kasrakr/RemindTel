from apscheduler.schedulers.asyncio import AsyncIOScheduler
from aiogram import Bot

from operations import get_pending_reminders, mark_reminder_sent, get_user

scheduler = AsyncIOScheduler()


async def _build_job(bot: Bot, reminder_id: int, chat_id: int, user_id: int, text: str):
    async def _send():
        try:
            user = await get_user(user_id)
            language = getattr(user, "language", "en") if user else "en"
            title = "⏰ یادآوری" if language == "fa" else "⏰ Reminder"
            await bot.send_message(chat_id, f"{title}:\n{text}")
        except Exception:
            pass
        finally:
            await mark_reminder_sent(reminder_id)

    return _send


async def schedule_reminder(bot: Bot, reminder) -> None:
    job = await _build_job(
        bot,
        reminder.id,
        reminder.chat_id,
        reminder.user_id,
        reminder.text,
    )
    scheduler.add_job(
        job,
        trigger="date",
        run_date=reminder.remind_at,
        id=f"reminder-{reminder.id}",
        replace_existing=True,
        misfire_grace_time=3600,
    )


async def cancel_reminder(reminder_id: int) -> None:
    job_id = f"reminder-{reminder_id}"
    if scheduler.get_job(job_id) is not None:
        scheduler.remove_job(job_id)


async def load_pending_reminders(bot: Bot) -> None:
    for reminder in await get_pending_reminders():
        await schedule_reminder(bot, reminder)


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()
