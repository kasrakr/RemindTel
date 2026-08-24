from apscheduler.schedulers.asyncio import AsyncIOScheduler
from aiogram import Bot

from operations import get_pending_reminders, mark_reminder_sent

scheduler = AsyncIOScheduler()


def _build_job(bot: Bot, reminder_id: int, chat_id: int, text: str):
    async def _send():
        try:
            await bot.send_message(chat_id, f"⏰ یادآوری:\n{text}")
        except Exception:
            pass
        finally:
            await mark_reminder_sent(reminder_id)

    return _send


async def schedule_reminder(bot: Bot, reminder) -> None:
    scheduler.add_job(
        _build_job(bot, reminder.id, reminder.chat_id, reminder.text),
        trigger="date",
        run_date=reminder.remind_at,
        id=f"reminder-{reminder.id}",
        replace_existing=True,
        misfire_grace_time=3600,
    )


async def cancel_reminder(reminder_id: int) -> None:
    job_id = f"reminder-{reminder_id}"
    job = scheduler.get_job(job_id)
    if job is not None:
        scheduler.remove_job(job_id)


async def load_pending_reminders(bot: Bot) -> None:
    for reminder in await get_pending_reminders():
        await schedule_reminder(bot, reminder)


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()
