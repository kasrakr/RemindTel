from aiogram.filters import Filter
from aiogram.types import Message
from aiogram.enums import ContentType
class isAdmin(Filter):
    def __init__(self, admins: list[int]) -> None:
        self.admins = admins

    async def __call__(self, event:Message) -> bool:
        if event.from_user.id in self.admins:
            return True
        else:
            return False


class Photo(Filter):
    def __init__(self) -> None:
        pass

    async def __call__(self, event = Message) -> bool:
        if event.content_type == ContentType.PHOTO:
            return True
        else:
            return False
