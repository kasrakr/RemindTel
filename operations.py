from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from models import Base, User, Reminder
from datetime import datetime
from sqlalchemy.sql import select

_engine = create_async_engine("sqlite+aiosqlite:///aiogram.db")
Session = async_sessionmaker(_engine, expire_on_commit=False)


async def create_table() -> None:
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # SQLite does not alter existing tables when create_all() sees a new column.
        columns = await conn.execute(text("PRAGMA table_info(users)"))
        column_names = {row[1] for row in columns.fetchall()}
        if "language" not in column_names:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN language VARCHAR(2) NOT NULL DEFAULT 'en'")
            )


async def insert_user(
    user_id: int,
    full_name: str | None = None,
    username: str | None = None,
    language: str = "en",
) -> User:
    user = User(
        user_id=user_id,
        full_name=full_name,
        username=username,
        language=language if language in {"fa", "en"} else "en",
    )
    async with Session.begin() as session:
        session.add(user)
    return user


async def get_user(user_id: int) -> User | None:
    query = select(User).where(User.user_id == user_id)
    async with Session() as session:
        user = await session.scalar(query)
    return user


async def get_users() -> list[User]:
    query = select(User)
    async with Session() as session:
        users = await session.scalars(query)
    return users.unique().all()


async def set_user_language(user_id: int, language: str) -> bool:
    if language not in {"fa", "en"}:
        return False

    async with Session.begin() as session:
        user = await session.scalar(select(User).where(User.user_id == user_id))
        if user is None:
            return False
        user.language = language
        return True


async def insert_reminder(
    user_id: int,
    chat_id: int,
    text: str,
    remind_at: datetime,
) -> Reminder:
    reminder = Reminder(
        user_id=user_id,
        chat_id=chat_id,
        text=text,
        remind_at=remind_at,
    )
    async with Session.begin() as session:
        session.add(reminder)
    return reminder


async def get_pending_reminders() -> list[Reminder]:
    query = select(Reminder).where(Reminder.is_sent == False)  # noqa: E712
    async with Session() as session:
        reminders = await session.scalars(query)
    return reminders.unique().all()


async def mark_reminder_sent(reminder_id: int) -> None:
    async with Session.begin() as session:
        reminder = await session.get(Reminder, reminder_id)
        if reminder is not None:
            reminder.is_sent = True


async def get_user_reminders(user_id: int) -> list[Reminder]:
    query = select(Reminder).where(
        Reminder.user_id == user_id,
        Reminder.is_sent == False,  # noqa: E712
    )
    async with Session() as session:
        reminders = await session.scalars(query)
    return reminders.unique().all()


async def delete_reminder(reminder_id: int, user_id: int) -> bool:
    async with Session.begin() as session:
        query = select(Reminder).where(
            Reminder.id == reminder_id,
            Reminder.user_id == user_id,
        )
        reminder = await session.scalar(query)

        if reminder is None:
            return False

        await session.delete(reminder)
        return True
