<a id="readme-top"></a>

<div align="center">

# ⏰ RemindTel

[![Typing SVG](https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=600&size=30&duration=3000&pause=900&color=2563EB&center=true&vCenter=true&width=870&height=60&lines=Smart+Telegram+Reminder+Bot+%E2%8F%B0;Simple-language+reminders+in+Persian+%26+English+%F0%9F%8C%90;Powered+by+Cloudflare+Workers+%E2%98%81%EF%B8%8F)](https://github.com/kasrakr/RemindTel)

A serverless Telegram reminder bot that understands natural-language scheduling in **Persian and English**, stores reminders in **Cloudflare D1**, and delivers them through **Cloudflare Workers + Cron Triggers**.

<p>
  <img src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Cloudflare%20D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare D1" />
  <img src="https://img.shields.io/badge/Telegram%20Bot%20API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Bot API" />
  <img src="https://img.shields.io/badge/Python-26A5E4?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/JavaScript-ES202x-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
</p>
<p>
  <img src="https://img.shields.io/badge/Wrangler-CLI-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Wrangler" />
  <img src="https://img.shields.io/github/license/kasrakr/RemindTel?style=for-the-badge&color=3B82F6" alt="License" />
  <img src="https://img.shields.io/github/last-commit/kasrakr/RemindTel?style=for-the-badge&color=2563EB" alt="Last commit" />
  <img src="https://img.shields.io/github/repo-size/kasrakr/RemindTel?style=for-the-badge&color=2563EB" alt="Repo size" />
  <img src="https://img.shields.io/github/stars/kasrakr/RemindTel?style=for-the-badge&color=facc15" alt="Stars" />
</p>

<p>
  <a href="https://t.me/RemindTel_Bot">
    <img src="https://img.shields.io/badge/Try%20the%20bot-%40RemindTel__Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Open RemindTel Bot" />
  </a>
</p>

<img src="https://visitor-badge.laobi.icu/badge?page_id=kasrakr.RemindTel" alt="Visitors" />

</div>

---
<div align="center">
  <img src="docs/12.png" alt="DevProject preview placeholder — replace with a real screenshot" width="900" />
</div>


## 📖 Table of Contents

- [About the Project](#-about-the-project)
- [How It Works](#-how-it-works)
- [Features](#-features)
- [Examples](#-examples)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [Usage](#-usage)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

---

## 🧭 About the Project

**RemindTel** is a Telegram reminder bot designed around one simple idea:

> You should be able to write a reminder the same way you would tell another person.

Instead of forcing users to memorize a command syntax, RemindTel accepts natural-language requests such as:

- `فردا ساعت ۵ به بابا زنگ بزن`
- `یک ربع به سه یادم بنداز با کسرا تماس بگیرم`
- `ساعت دو و نیم یادم بنداز پروژه رو commit کنم`
- `Remind me to call Dad tomorrow at 5 PM`

The Worker implementation is a serverless port of the original Python/aiogram bot. The production-oriented version replaces long polling with a Telegram webhook, replaces SQLite/SQLAlchemy persistence with Cloudflare D1, replaces the in-memory APScheduler with a Cloudflare Cron Trigger, and stores conversational state in D1 so it survives Worker invocations.

The bot is publicly available as **[@RemindTel_Bot](https://t.me/RemindTel_Bot)**.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## ⚙️ How It Works

```text
┌───────────────────┐
│   Telegram User   │
└─────────┬─────────┘
          │
          │ HTTPS Webhook
          ▼
┌──────────────────────────┐
│    Cloudflare Worker     │
│                          │
│  /webhook                │
│  /install                │
│  fetch()                 │
│  scheduled()             │
└──────────┬───────────────┘
           │
     ┌─────┴─────────────────────┐
     │                           │
     ▼                           ▼
┌──────────────┐          ┌─────────────────┐
│ Cloudflare D1│          │ Telegram Bot API│
│              │          │                 │
│ users        │          │ sendMessage     │
│ reminders    │          │ sendPhoto       │
│ bot_state    │          │ callbacks       │
└──────────────┘          └─────────────────┘
           ▲
           │
           │ every minute
           │
┌──────────┴───────────┐
│ Cloudflare Cron       │
│ Trigger               │
│ checks due reminders  │
└───────────────────────┘
```

Incoming Telegram updates are accepted at `/webhook`, processed in the background with `waitUntil()`, and the scheduled handler checks D1 for due reminders before sending them through the Telegram Bot API.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## ✨ Features

|     | Feature | Description |
|:---:|---|---|
| ⏰ | **Natural-Language Reminders** | Create reminders without rigid command syntax. |
| 🇮🇷 | **Persian Time Parsing** | Handles Persian digits, weekdays, relative dates, colloquial expressions, and phrases such as `ربع به`, `نیم ساعت بعد`, and `ساعت دو و نیم`. |
| 🇬🇧 | **English Support** | English reminder input and English interface are supported alongside Persian. |
| 🤖 | **LLM Fallback Parser** | When deterministic parsing cannot confidently resolve a reminder, the Worker can fall back to an OpenAI-compatible LLM parser. |
| 🌍 | **Bilingual Interface** | Users can switch between Persian and English from the bot UI. |
| 📋 | **Reminder Management** | View active reminders and delete them using inline buttons. |
| 🛡️ | **Ownership Checks** | Reminder deletion is restricted to the user who created the reminder. |
| ⏱️ | **Reliable Scheduling** | Due reminders are persisted in D1 and checked by a Cron Trigger instead of depending on in-memory Worker state. |
| 💾 | **Persistent State** | Users, reminders, and bot interaction state are stored in D1. |
| 🔐 | **Webhook Secret Verification** | Optional Telegram `secret_token` verification is supported through `WEBHOOK_SECRET`. |
| 🚦 | **Rate Limiting** | An optional Cloudflare rate limiter can protect reminder creation from excessive requests. |
| 📢 | **Admin Broadcast** | Admins can use `/broad` to broadcast a Telegram message to registered users. |
| 🖼️ | **Optional Welcome Image** | `/start` can send a hosted welcome image through `WELCOME_PHOTO_URL`. |
| ❤️‍🔥 | **Message Reaction** | Successful reminder creation can react to the original Telegram message. |
| ☁️ | **Serverless Deployment** | Runs as a Cloudflare Worker without a traditional VPS process. |

The current Worker source implements the bilingual menu, reminder listing/deletion, 700-character input limit, optional rate limiting, and admin broadcast flow. 
<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 💬 Examples

### Persian

```text
فردا ساعت ۵ به بابا زنگ بزن
```

```text
یک ربع به سه یادم بنداز با کسرا تماس بگیرم
```

```text
ساعت دو و نیم یادم بنداز پروژه رو commit کنم
```

### English

```text
Remind me to call Dad tomorrow at 5 PM
```

```text
Remind me at a quarter to three to call Kasra
```

```text
Remind me half an hour after two to commit the project
```

The parser separates the reminder description from the requested date/time and converts the resulting local wall-clock time into a UTC timestamp for D1 storage. The Worker currently uses a configurable timezone offset, defaulting to Iran Standard Time (UTC+3:30). 

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 🧱 Tech Stack

<div align="center">

<img src="https://img.shields.io/badge/Python-26A5E4?style=for-the-badge&logo=python&logoColor=white" />
<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
<img src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
<img src="https://img.shields.io/badge/Cloudflare%20D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
<img src="https://img.shields.io/badge/Wrangler-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
<img src="https://img.shields.io/badge/Telegram%20Bot%20API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" />
<img src="https://img.shields.io/badge/OpenAI--Compatible%20API-412991?style=for-the-badge&logo=openai&logoColor=white" />

</div>

### Runtime & Infrastructure

| Layer | Technology |
|---|---|
| Bot interface | Telegram Bot API |
| Compute | Cloudflare Workers |
| Persistence | Cloudflare D1 |
| Scheduling | Cloudflare Cron Triggers |
| Deployment | Wrangler CLI |
| Primary Worker | `js/worker.js` |
| Natural-language parsing | Custom JavaScript parser + optional LLM fallback |
| Original implementation | Python + aiogram + SQLAlchemy + SQLite + APScheduler |

The Worker source explicitly documents the migration from aiogram long polling → Telegram webhooks, SQLite/SQLAlchemy → D1, APScheduler → Cron Triggers, and in-memory step state → D1-backed state.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 📁 Project Structure

```text
RemindTel/
├── js/
│   └── worker.js             # Cloudflare Worker implementation
│
├── docs/
│   ├── 1.png                 # Project / bot documentation asset
│   └── 2.png                 # Welcome image asset used by the original bot
│
├── main.py                   # Original Python / aiogram implementation
├── models.py                 # SQLAlchemy models used by the original version
├── operations.py             # Database operations for the original version
├── scheduler.py              # APScheduler implementation used by the original version
├── persian_time.py           # Original Persian time parser
├── llm_parser.py             # Original LLM fallback parser
├── i18n.py                   # Original translations
├── middlewares.py            # Original aiogram middleware
├── filters.py                # Original admin filter
├── requirements.txt          # Python dependencies
├── LICENSE
└── README.md
```

The repository currently contains both the original Python implementation and the single-file Cloudflare Worker port. The Worker itself contains the ported i18n, Persian parser, LLM fallback, D1 operations, Telegram handlers, webhook entry point, and Cron scheduler. 

<p align="right">(<a href="#readme-top">back to top</a>)</p>


## 🏗️ Architecture

### Request flow

```text
Telegram
   │
   │ POST /webhook
   ▼
Cloudflare Worker
   │
   ├── validate webhook secret (optional)
   ├── identify / create user
   ├── inspect command / callback / reminder
   ├── parse Persian or English time
   ├── optional LLM fallback
   └── persist reminder in D1
              │
              ▼
          Cloudflare D1
```

### Reminder delivery flow

```text
Cloudflare Cron Trigger
          │
          ▼
     scheduled()
          │
          ▼
   Query due reminders
          │
          ▼
      Telegram API
          │
          ▼
     User receives
        reminder
```

The Worker responds to Telegram immediately with `200 OK` and uses `ctx.waitUntil()` for background processing, reducing the chance that slow parsing or D1 operations cause Telegram webhook retries. citeturn882347view2

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 🧭 Usage

Open the bot:

**[@RemindTel_Bot](https://t.me/RemindTel_Bot)**

Then:

1. Send `/start`.
2. Choose **Persian** or **English**.
3. Write a reminder naturally.
4. RemindTel parses the requested time.
5. The reminder is stored in D1.
6. When the reminder is due, the Worker sends a Telegram notification.
7. Use **My Reminders** to view active reminders.
8. Use the inline **Delete** button to remove a reminder.

The Worker also supports `/broad` for configured admins and silently ignores unsupported non-text updates/unknown commands. citeturn882347view1

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 🗺️ Roadmap

- [x] Telegram reminder creation
- [x] Persian natural-language time parsing
- [x] English natural-language time parsing
- [x] Persian / English interface
- [x] Cloudflare Worker port
- [x] Telegram webhook processing
- [x] Cloudflare D1 persistence
- [x] Cron-based reminder delivery
- [x] Reminder listing and deletion
- [x] Optional LLM parsing fallback
- [x] Optional webhook secret verification
- [x] Optional rate limiting
- [x] Admin broadcast

See the [issues page](https://github.com/kasrakr/RemindTel/issues) for open items and future ideas.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 🤝 Contributing

Contributions, bug reports, parser improvements, and new reminder ideas are welcome.

```bash
# 1. Fork the repository

# 2. Clone your fork
git clone https://github.com/<your-username>/RemindTel.git
cd RemindTel

# 3. Create a feature branch
git checkout -b feature/AmazingFeature

# 4. Make your changes

# 5. Commit
git add .
git commit -m "Add AmazingFeature"

# 6. Push
git push origin feature/AmazingFeature

# 7. Open a Pull Request
```

For parser changes, include representative Persian and English examples whenever possible.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## 📬 Contact

**Kasra Karimian**

<div align="center">

<a href="https://github.com/kasrakr">
  <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" />
</a>
<a href="https://linkedin.com/in/kasrakarimian">
  <img src="https://img.shields.io/badge/LinkedIn-A855F7?style=for-the-badge&logo=linkedin&logoColor=white&labelColor=1E1B4B" />
</a>
<a href="https://t.me/lowkasra">
  <img src="https://img.shields.io/badge/Telegram-8B5CF6?style=for-the-badge&logo=telegram&logoColor=white&labelColor=1E1B4B" />
</a>

</div>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<details>
<summary>⭐ Star History</summary>
<img src="https://api.star-history.com/svg?repos=kasrakr/RemindTel&type=Date" width="100%" />
</details>

<div align="center">

If RemindTel helped you or you like the project, consider giving it a ⭐ — it means a lot!

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&height=160&color=0:F59E0B,100:F97316&section=footer&animation=fadeIn" width="100%"/>
