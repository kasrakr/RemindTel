TEXTS = {
    "fa": {
        "language_name": "فارسی",
        "language_button": "🌐 تغییر زبان",
        "my_reminders": "یادآوری های من⏱️",
        "contact": "تماس📞",
        "help": "راهنما❓",
        "welcome": "به ربات RemindTel خوش آمدید {name} عزیز!",
        "menu_ready": "از منوی زیر استفاده کن یا درخواستت را به صورت طبیعی بنویس.",
        "choose_language": "🌐 زبان ربات را انتخاب کنید:",
        "language_changed": "زبان ربات روی فارسی تنظیم شد 🇮🇷",
        "language_changed_en": "Bot language changed to English 🇬🇧",
        "help_text": (
            "⚪ برای تنظیم یادآوری، درخواستت را طبیعی بنویس.\n\n"
            "مثال‌ها:\n"
            "• فردا ساعت ۵ به متین زنگ بزن\n"
            "• روز قبل کریسمس ساعت ۹ می‌خوام برم فوتبال\n"
            "• یک ربع به سه یادم بنداز با مسعود تماس بگیرم\n"
            "• ساعت دو و نیم یادم بنداز پروژه رو commit کنم"
        ),
        "contact_text": "خوشحال می‌شم نظراتت رو ببینم:",
        "no_reminders": "⏱️ شما هیچ یادآوری‌ای ندارید.",
        "reminders_title": "📋 یادآوری‌های شما:",
        "delete": "🗑 حذف #{id}",
        "confirm_delete": "⚠️ مطمئنی می‌خواهی یادآوری #{id} حذف شود؟",
        "yes_delete": "✅ بله، حذفش کن",
        "cancel": "❌ لغو",
        "deleted": "یادآوری حذف شد ✅",
        "cancelled": "حذف لغو شد.",
        "invalid_reminder": "یادآوری نامعتبر است.",
        "not_found": "این یادآوری پیدا نشد یا متعلق به شما نیست.",
        "parse_error": (
            "متوجه یادآوری شما نشدم 🙁\n"
            "مثال: فردا حدود ساعت پنج به متین زنگ بزن"
        ),
        "scheduled": "✅ یادآوری تنظیم شد:\n📝 {description}\n🗓 {when}",
        "weekday": ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"],
    },
    "en": {
        "language_name": "English",
        "language_button": "🌐 Change language",
        "my_reminders": "⏱️ My Reminders",
        "contact": "📞 Contact",
        "help": "❓ Help",
        "welcome": "Welcome to RemindTel, {name}!",
        "menu_ready": "Use the menu below or write your reminder naturally.",
        "choose_language": "🌐 Choose your bot language:",
        "language_changed": "Bot language changed to Persian 🇮🇷",
        "language_changed_en": "Bot language changed to English 🇬🇧",
        "help_text": (
            "⚪ Set reminders by writing naturally.\n\n"
            "Examples:\n"
            "• Remind me to call Matin tomorrow at 5 PM\n"
            "• I want to play football at 9 AM the day before Christmas\n"
            "• Remind me at a quarter to three to call Masoud\n"
            "• Remind me half an hour after two to commit the project"
        ),
        "contact_text": "I’d love to hear your feedback:",
        "no_reminders": "⏱️ You have no reminders.",
        "reminders_title": "📋 Your reminders:",
        "delete": "🗑 Delete #{id}",
        "confirm_delete": "⚠️ Are you sure you want to delete reminder #{id}?",
        "yes_delete": "✅ Yes, delete it",
        "cancel": "❌ Cancel",
        "deleted": "Reminder deleted ✅",
        "cancelled": "Deletion cancelled.",
        "invalid_reminder": "Invalid reminder.",
        "not_found": "This reminder was not found or does not belong to you.",
        "parse_error": (
            "I couldn't understand your reminder 🙁\n"
            "Example: Remind me to call Ali tomorrow around 5 PM"
        ),
        "scheduled": "✅ Reminder scheduled:\n📝 {description}\n🗓 {when}",
        "weekday": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    },
}


def t(lang: str, key: str, **kwargs) -> str:
    value = TEXTS.get(lang, TEXTS["en"])[key]
    if isinstance(value, str) and kwargs:
        return value.format(**kwargs)
    return value
