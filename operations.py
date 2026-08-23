from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from models import Base, User
from datetime import datetime
from sqlalchemy.sql import select

_engine = create_async_engine("sqlite+aiosqlite:///aiogram.db")
Session = async_sessionmaker(_engine, expire_on_commit=False)

#creating tables based on models we had.
async def  create_table() -> None :
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def insert_user(user_id: int, full_name: str | None=None, username: str |None = None) -> User :
    user = User(user_id = user_id, full_name = full_name, username = username)
    async with Session.begin() as session:
        session.add(user)
    return user

async def get_user(user_id: int) -> User | None :
    query = select(User).where(User.user_id == user_id)
    async with Session() as session:
        #it would find user and return if its not valid return none
        user = await session.scalar(query)
    return user