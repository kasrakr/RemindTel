from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy import BIGINT, VARCHAR
from datetime import datetime

class Base(AsyncAttrs, DeclarativeBase):
    pass

class User(Base):
    __tablename__='users'

    id : Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id : Mapped[int] = mapped_column(BIGINT(), unique=True)
    username : Mapped[str] = mapped_column(VARCHAR(128), nullable=True, unique=True)
    full_name : Mapped[str] = mapped_column(VARCHAR(128), nullable=True)
    join_date : Mapped[datetime] = mapped_column(default=datetime.now)
