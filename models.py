from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy import BIGINT, VARCHAR
from datetime import datetime


class Base(AsyncAttrs, DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BIGINT(), unique=True)
    username: Mapped[str] = mapped_column(VARCHAR(128), nullable=True, unique=True)
    full_name: Mapped[str] = mapped_column(VARCHAR(128), nullable=True)
    join_date: Mapped[datetime] = mapped_column(default=datetime.now)
    is_blocked: Mapped[bool] = mapped_column(default=False)
    language: Mapped[str] = mapped_column(VARCHAR(2), default="en", nullable=False)


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BIGINT())
    chat_id: Mapped[int] = mapped_column(BIGINT())
    text: Mapped[str] = mapped_column(VARCHAR(512))
    remind_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)
    is_sent: Mapped[bool] = mapped_column(default=False)
