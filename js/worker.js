/**
 * RemindTel — Telegram reminder bot
 * ------------------------------------------------------------------
 * Single-file Cloudflare Worker port of https://github.com/kasrakr/RemindTel
 *
 * Original stack -> Worker equivalent:
 *   aiogram long-polling      -> Telegram webhook (POST /webhook)
 *   SQLAlchemy + SQLite       -> D1 (binding: DB)
 *   APScheduler (in-memory)   -> Cron Trigger (`scheduled` handler polls D1
 *                                every minute for due reminders)
 *   aiostep MemoryStateStorage-> a `bot_state` table in D1 (in-memory state
 *                                doesn't survive across Worker invocations)
 *   FSInputFile (docs/2.png)  -> optional WELCOME_PHOTO_URL env var
 *                                (Workers have no bundled filesystem for
 *                                binary assets; point it at a hosted image
 *                                if you want the welcome photo back)
 *
 * REQUIRED bindings / env vars (set with `wrangler secret put` for secrets):
 *   DB                    D1 database binding (see schema in ensureSchema)
 *   TELEGRAM_BOT_TOKEN    secret - your bot token from @BotFather
 *   ADMINS                comma-separated Telegram user IDs, e.g. "123,456"
 *
 * OPTIONAL env vars:
 *   OPENAI_API_KEY            secret - enables the LLM fallback parser
 *   OPENAI_BASE_URL           default "https://api.gapgpt.app/v1" (same
 *                              OpenAI-compatible proxy the original used)
 *   OPENAI_MODEL              default "gpt-5.6-luna"
 *   TIMEZONE_OFFSET_MINUTES   default "210" (Iran Standard Time, UTC+3:30,
 *                              no DST). All "امروز/فردا/ساعت ..." parsing
 *                              and displayed times use this as local time;
 *                              storage in D1 is always true UTC.
 *   WEBHOOK_SECRET            secret - if set, Telegram's secret_token
 *                              header is verified on every webhook call
 *   WELCOME_PHOTO_URL         hosted image URL for the /start photo
 *
 * DEPLOYMENT (see accompanying wrangler.toml):
 *   1. wrangler d1 create remindtel-db   (put the id in wrangler.toml)
 *   2. wrangler secret put TELEGRAM_BOT_TOKEN
 *      wrangler secret put OPENAI_API_KEY      (optional)
 *      wrangler secret put WEBHOOK_SECRET      (optional but recommended)
 *   3. wrangler deploy
 *   4. Visit https://<your-worker>.workers.dev/install once (GET request)
 *      to register the Telegram webhook automatically. Re-run it any time
 *      the Worker's URL changes.
 *
 * Tables are created lazily on first request (CREATE TABLE IF NOT EXISTS),
 * so no manual migration step is required for a fresh D1 database.
 */

// ============================================================================
// i18n (ported from i18n.py)
// ============================================================================

const TEXTS = {
  fa: {
    language_name: 'فارسی',
    anguage_button: '🌐 تغییر زبان',
    my_reminders: '⏱️ یادآوری های من',
    contact: '📞 تماس',
    help: '❕ راهنما',
    welcome: 'به ربات RemindTel خوش آمدید {name} عزیز!',
    menu_ready: 'از منوی زیر استفاده کن یا درخواستت را به صورت طبیعی بنویس.',
    choose_language: '🌐 زبان ربات را انتخاب کنید:',
    language_changed: 'زبان ربات روی فارسی تنظیم شد 🇮🇷',
    language_changed_en: 'Bot language changed to English 🇬🇧',
    help_text:
      '⚪ برای تنظیم یادآوری، درخواستت را طبیعی بنویس.\n\n' +
      'مثال‌ها:\n' +
      '• فردا ساعت ۵ به متین زنگ بزن\n' +
      '• روز قبل کریسمس ساعت ۹ می‌خوام برم فوتبال\n' +
      '• یک ربع به سه یادم بنداز با مسعود تماس بگیرم\n' +
      '• ساعت دو و نیم یادم بنداز پروژه رو commit کنم',
    contact_text: 'خوشحال می‌شم نظراتت رو ببینم:',
    no_reminders: '⏱️ شما هیچ یادآوری‌ای ندارید.',
    reminders_title: '📋 یادآوری‌های شما:',
    delete: '🗑 حذف #{id}',
    confirm_delete: '⚠️ مطمئنی می‌خواهی یادآوری #{id} حذف شود؟',
    yes_delete: '✅ بله، حذفش کن',
    cancel: '❌ لغو',
    deleted: 'یادآوری حذف شد ✅',
    cancelled: 'حذف لغو شد.',
    invalid_reminder: 'یادآوری نامعتبر است.',
    not_found: 'این یادآوری پیدا نشد یا متعلق به شما نیست.',
    parse_error: 'متوجه یادآوری شما نشدم 🙁\nمثال: فردا حدود ساعت پنج به متین زنگ بزن',
    scheduled: '✅ یادآوری تنظیم شد:\n📝 {description}\n🗓 {when}',
    weekday: ['دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه', 'یکشنبه'],
  },
  en: {
    language_name: 'English',
    language_button: '🌐 Change language',
    my_reminders: '⏱️ My Reminders',
    contact: '📞 Contact',
    help: '❕ Help',
    welcome: 'Welcome to RemindTel, {name}!',
    menu_ready: 'Use the menu below or write your reminder naturally.',
    choose_language: '🌐 Choose your bot language:',
    language_changed: 'Bot language changed to Persian 🇮🇷',
    language_changed_en: 'Bot language changed to English 🇬🇧',
    help_text:
      '⚪ Set reminders by writing naturally.\n\n' +
      'Examples:\n' +
      '• Remind me to call Matin tomorrow at 5 PM\n' +
      '• I want to play football at 9 AM the day before Christmas\n' +
      '• Remind me at a quarter to three to call Masoud\n' +
      '• Remind me half an hour after two to commit the project',
    contact_text: 'I’d love to hear your feedback:',
    no_reminders: '⏱️ You have no reminders.',
    reminders_title: '📋 Your reminders:',
    delete: '🗑 Delete #{id}',
    confirm_delete: '⚠️ Are you sure you want to delete reminder #{id}?',
    yes_delete: '✅ Yes, delete it',
    cancel: '❌ Cancel',
    deleted: 'Reminder deleted ✅',
    cancelled: 'Deletion cancelled.',
    invalid_reminder: 'Invalid reminder.',
    not_found: 'This reminder was not found or does not belong to you.',
    parse_error: "I couldn't understand your reminder 🙁\nExample: Remind me to call Ali tomorrow around 5 PM",
    scheduled: '✅ Reminder scheduled:\n📝 {description}\n🗓 {when}',
    weekday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
};

function t(lang, key, vars) {
  const value = (TEXTS[lang] || TEXTS.en)[key];
  if (typeof value === 'string' && vars) {
    return value.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  }
  return value;
}

// ============================================================================
// Persian natural-language time parser (ported from persian_time.py, verified
// against the Python original on 30+ example phrases)
// ============================================================================

const PERSIAN_DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

const WEEKDAYS = {
  شنبه: 5, 'یک شنبه': 6, یکشنبه: 6, 'یک‌شنبه': 6,
  'دو شنبه': 0, دوشنبه: 0, 'دو‌شنبه': 0,
  'سه شنبه': 1, 'سه‌شنبه': 1,
  'چهار شنبه': 2, چهارشنبه: 2, 'چهار‌شنبه': 2,
  'پنج شنبه': 3, پنجشنبه: 3, 'پنج‌شنبه': 3,
  جمعه: 4, 'آخر هفته': 4, آخرهفته: 4,
};
const WEEKDAYS_SORTED = Object.entries(WEEKDAYS).sort((a, b) => b[0].length - a[0].length);

const RELATIVE_DAYS = { 'پس فردا': 2, 'پس‌فردا': 2, پسفردا: 2, فردا: 1, امروز: 0, امشب: 0 };
const RELATIVE_DAYS_SORTED = Object.entries(RELATIVE_DAYS).sort((a, b) => b[0].length - a[0].length);

const DEFAULT_HOUR_FOR_WORD = { امشب: 21 };

const PERIOD_WORDS = ['بعدازظهر', 'بعد از ظهر', 'صبح', 'ظهر', 'عصر', 'شب'];
const PERIOD_RE = [...PERIOD_WORDS].sort((a, b) => b.length - a.length).join('|');

const PERSIAN_HOUR_WORDS = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12 };
const PERSIAN_HOUR_RE = Object.keys(PERSIAN_HOUR_WORDS).sort((a, b) => b.length - a.length).join('|');
const HOUR_RE = `(?:\\d{1,2}|${PERSIAN_HOUR_RE})`;

const TIME_RE = new RegExp(
  `(?:(${PERIOD_RE})\\s+)?ساعت\\s*(${HOUR_RE})(?::(\\d{2}))?` +
    `(?:\\s*(و)?\\s*(نیم|ربع))?` +
    `\\s*(${PERIOD_RE})?`
);

const TO_QUARTER_RE = new RegExp(`(?:یک\\s+)?ربع\\s+به\\s+(${HOUR_RE})`);
const HALF_AFTER_RE = new RegExp(`نیم\\s+ساعت\\s+بعد(?:\\s+از)?\\s+(?:ساعت\\s+)?(${HOUR_RE})`);
const HOUR_AND_HALF_RE = new RegExp(`(?:ساعت\\s+)?(${HOUR_RE})\\s+و\\s+نیم`);
const STANDALONE_PERIOD_RE = new RegExp(PERIOD_RE);

const DEFAULT_HOUR_FOR_PERIOD = { صبح: 9, ظهر: 12, عصر: 17, بعدازظهر: 16, 'بعد از ظهر': 16, شب: 21 };

const FILLER_WORDS = ['برای', 'در', 'روز', 'ساعت', 'حدود', 'تقریبا', 'تقریباً'];

const UNRESOLVED_DATE_RE = new RegExp(
  'عید|هفته|رمضان|نوروز|یلدا|چهارشنبه[‌ ]?سوری|تاسوعا|عاشورا|' + '(روز|شب)\\s+(قبل|بعد)|مونده\\s+به|مانده\\s+به'
);

const OFFSET_UNIT_WORDS = { روز: 'd', هفته: 'w', ماه: 'm', سال: 'y' };
const OFFSET_UNIT_RE = Object.keys(OFFSET_UNIT_WORDS).sort((a, b) => b.length - a.length).join('|');
const COUNT_RE = `(?:\\d+|${PERSIAN_HOUR_RE})`;
const N_UNITS_LATER_RE = new RegExp(`(?:(${COUNT_RE})\\s+)?(${OFFSET_UNIT_RE})[‌ ]?(?:ی[‌ ]?)?(?:دیگه|دیگر|بعد)`);

function normalizeDigits(text) {
  return text.replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS[d]);
}

function hourFromToken(token) {
  token = token.trim();
  if (token in PERSIAN_HOUR_WORDS) return PERSIAN_HOUR_WORDS[token];
  return parseInt(token, 10);
}

// Date-only arithmetic via UTC-based epoch math, kept deliberately separate
// from any real timezone concept — {y, m, d} is a plain wall-clock calendar
// date (m is 1-12), mirroring Python's naive `date` objects.
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDaysToDate({ y, m, d }, days) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function addMonths({ y, m, d }, months) {
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return { y: year, m: month, d: day };
}

function addYears({ y, m, d }, years) {
  const targetYear = y + years;
  const day = Math.min(d, daysInMonth(targetYear, m));
  return { y: targetYear, m, d: day };
}

// 0=Monday..6=Sunday, matching Python's datetime.weekday()
function weekdayOf({ y, m, d }) {
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

function applyPeriod(hour, period) {
  period = (period || '').replace(/ /g, '').replace(/‌/g, '');
  if (period === 'صبح') return hour === 12 ? 0 : hour;
  if (period === 'ظهر') return 12;
  if (period === 'عصر' || period === 'بعدازظهر') return hour < 12 ? hour + 12 : hour;
  if (period === 'شب') {
    if (hour === 12) return 0;
    return hour < 12 ? hour + 12 : hour;
  }
  return hour;
}

function guessHourWithoutPeriod(hour) {
  if (hour === 0 || hour === 12) return hour !== 0 ? hour : 0;
  if (hour >= 7 && hour <= 11) return hour;
  if (hour >= 1 && hour <= 6) return hour + 12;
  return hour;
}
const naturalHour = guessHourWithoutPeriod;

// Python-style divmod (floor division, non-negative remainder for a positive divisor)
function divmod(total, div) {
  const q = Math.floor(total / div);
  const r = total - q * div;
  return [q, r];
}

function stripSpans(text, spans) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let out = '';
  let last = 0;
  for (const [start, end] of sorted) {
    out += text.slice(last, start);
    last = Math.max(last, end);
  }
  out += text.slice(last);
  let cleaned = out;
  for (const w of FILLER_WORDS) {
    const re = new RegExp(`(?:^|\\s)${w}(?=\\s|$)`, 'g');
    cleaned = cleaned.replace(re, ' ');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[\s\t\n\r،,.:؛-]+|[\s\t\n\r،,.:؛-]+$/g, '');
  return cleaned;
}

/**
 * Parse a Persian free-text reminder phrase.
 * @param {string} text
 * @param {{y:number,m:number,d:number,hour:number,minute:number}} now  local wall-clock "now"
 * @returns {{description: string, remindAt: {y:number,m:number,d:number,hour:number,minute:number}} | null}
 */
function parseReminderPersian(text, now) {
  const working = normalizeDigits(text);
  const spans = [];

  let targetDate = null;
  let matchedDayWord = null;
  let isWeekdayMatch = false;

  for (const [word, offset] of RELATIVE_DAYS_SORTED) {
    const idx = working.indexOf(word);
    if (idx !== -1) {
      targetDate = addDaysToDate({ y: now.y, m: now.m, d: now.d }, offset);
      matchedDayWord = word;
      spans.push([idx, idx + word.length]);
      break;
    }
  }

  if (targetDate === null) {
    for (const [word, weekday] of WEEKDAYS_SORTED) {
      const idx = working.indexOf(word);
      if (idx !== -1) {
        const nowWeekday = weekdayOf({ y: now.y, m: now.m, d: now.d });
        const daysAhead = (((weekday - nowWeekday) % 7) + 7) % 7;
        targetDate = addDaysToDate({ y: now.y, m: now.m, d: now.d }, daysAhead);
        matchedDayWord = word;
        isWeekdayMatch = true;
        spans.push([idx, idx + word.length]);
        break;
      }
    }
  }

  const offsetMatch = N_UNITS_LATER_RE.exec(working);
  if (offsetMatch) {
    spans.push([offsetMatch.index, offsetMatch.index + offsetMatch[0].length]);
    const count = offsetMatch[1] ? hourFromToken(offsetMatch[1]) : 1;
    const unit = OFFSET_UNIT_WORDS[offsetMatch[2]];

    if (targetDate === null) targetDate = { y: now.y, m: now.m, d: now.d };

    if (unit === 'd') targetDate = addDaysToDate(targetDate, count);
    else if (unit === 'w') targetDate = addDaysToDate(targetDate, count * 7);
    else if (unit === 'm') targetDate = addMonths(targetDate, count);
    else if (unit === 'y') targetDate = addYears(targetDate, count);
  }

  let hour = null;
  let minute = 0;

  let m = TO_QUARTER_RE.exec(working);
  if (m) {
    const baseHour = naturalHour(hourFromToken(m[1]));
    const totalMinutes = baseHour * 60 - 15;
    [hour, minute] = divmod(totalMinutes, 60);
    spans.push([m.index, m.index + m[0].length]);
  }

  if (hour === null) {
    m = HALF_AFTER_RE.exec(working);
    if (m) {
      const baseHour = naturalHour(hourFromToken(m[1]));
      const totalMinutes = baseHour * 60 + 30;
      [hour, minute] = divmod(totalMinutes, 60);
      spans.push([m.index, m.index + m[0].length]);
    }
  }

  if (hour === null) {
    m = HOUR_AND_HALF_RE.exec(working);
    if (m) {
      hour = naturalHour(hourFromToken(m[1]));
      minute = 30;
      spans.push([m.index, m.index + m[0].length]);
    }
  }

  if (hour === null) {
    m = TIME_RE.exec(working);
    if (m) {
      hour = hourFromToken(m[2]);
      if (m[3]) minute = parseInt(m[3], 10);
      else if (m[5] === 'نیم') minute = 30;
      else if (m[5] === 'ربع') minute = 15;

      const period = m[6] || m[1];
      if (period) hour = applyPeriod(hour, period);
      else hour = guessHourWithoutPeriod(hour);

      spans.push([m.index, m.index + m[0].length]);
    }
  }

  if (hour === null) {
    const pm = STANDALONE_PERIOD_RE.exec(working);
    if (pm) {
      const period = pm[0];
      hour = DEFAULT_HOUR_FOR_PERIOD[period.replace(/ /g, '')] ?? 9;
      spans.push([pm.index, pm.index + pm[0].length]);
    }
  }

  if (targetDate === null && hour === null) return null;

  if (targetDate === null) {
    if (UNRESOLVED_DATE_RE.test(working)) return null;
    targetDate = { y: now.y, m: now.m, d: now.d };
  }

  if (hour === null) hour = DEFAULT_HOUR_FOR_WORD[matchedDayWord || ''] ?? 9;

  let remindAt = { y: targetDate.y, m: targetDate.m, d: targetDate.d, hour, minute };

  const remindEpoch = Date.UTC(remindAt.y, remindAt.m - 1, remindAt.d, remindAt.hour, remindAt.minute);
  const nowEpoch = Date.UTC(now.y, now.m - 1, now.d, now.hour, now.minute);
  const sameDay = remindAt.y === now.y && remindAt.m === now.m && remindAt.d === now.d;

  if (remindEpoch <= nowEpoch && sameDay) {
    const shifted = addDaysToDate(targetDate, isWeekdayMatch ? 7 : 1);
    remindAt = { ...remindAt, y: shifted.y, m: shifted.m, d: shifted.d };
  }

  let description = stripSpans(working, spans);
  if (!description) description = 'یادآوری';

  return { description, remindAt };
}

// ============================================================================
// LLM fallback parser (ported from llm_parser.py)
// ============================================================================

const LLM_SYSTEM_PROMPT = `You are the semantic natural-language parser for a Telegram reminder bot.
Your job is NOT to reply to the user. Your job is to understand the user's
sentence in Persian or English and convert it into one precise reminder.

IMPORTANT:
- Prefer semantic understanding over keyword matching.
- The application provides the current local datetime. Use it as the reference.
- Return a reminder only when the requested time can be reasonably inferred.
- Never let scheduling words become part of the reminder description.
- Preserve the actual activity/task in the description, in the user's language.
- Resolve Persian natural language, colloquial wording, half-spaces, and spelling variants.

DATE/TIME UNDERSTANDING:
- امروز, فردا, پس فردا, امشب, فردا شب, هفته بعد, شنبه بعد, دوشنبه آینده, etc.
- Relative expressions: «دو ساعت دیگه», «نیم ساعت بعد», «سه روز دیگه», «دو روز قبل از...», etc.
- Calendar offsets: «هفته دیگه», «هفته بعد», «دو هفته دیگه», «سه هفته بعد».
- Month offsets: «ماه دیگه», «ماه بعد», «دو ماه دیگه», «سه ماه بعد».
- Year offsets: «سال دیگه», «سال بعد», «دو سال دیگه», «سه سال بعد».
- For month offsets, preserve calendar semantics rather than assuming a fixed number of days.
- For year offsets, preserve calendar semantics and safely handle February 29 in non-leap years.
- Natural clock expressions: «سه و نیم», «یک ربع به سه», «ربع بعد از دو», «حدود پنج», «نزدیک ساعت شش», etc.
- Explicit periods: صبح, ظهر, عصر, بعدازظهر, شب.
- Bare hours 1-6 usually mean afternoon/evening to match the bot's existing behavior.
- Bare hours 7-11 usually mean morning.
- 12 means noon unless context changes it.

PERSIAN DATE REFERENCES:
Understand semantic calendar references such as:
- «روز قبل عید قربان» = the calendar day immediately before Eid al-Adha.
- «روز بعد عید قربان» = the day immediately after Eid al-Adha.
- «شب قبل عید», «دو روز مونده به عید», «سه روز بعد امتحان», etc.
- Recognize common Persian religious/national holiday names when their date
  can be reliably inferred. Do not fabricate an obscure date.
- A phrase such as «روز قبل عید قربان ساعت 9 میخوام برم فوتبال» means the
  reminder activity is «برم فوتبال», while «روز قبل عید قربان ساعت 9» is the
  scheduling information and must NOT appear in the description.

DESCRIPTION EXTRACTION:
Examples:
- «روز قبل عید قربان ساعت 9 میخوام برم فوتبال» -> description: «برم فوتبال»
- «فردا ساعت پنج به علی زنگ بزن» -> description: «به علی زنگ بزن»
- «سه شنبه ساعت 10 جلسه با احمد» -> description: «جلسه با احمد»
- «Remind me tomorrow at 5 PM to call Sara» -> description: «call Sara»

When uncertain about a date reference, return intent="unknown" instead of
silently converting the user's text into today's/ tomorrow's date.`;

const LLM_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['create_reminder', 'unknown'] },
    description: { type: 'string' },
    remind_at: { type: 'string', description: 'ISO 8601 local datetime without timezone offset' },
  },
  required: ['intent', 'description', 'remind_at'],
  additionalProperties: false,
};

function parseLocalIso(isoStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(isoStr);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], hour: +m[4], minute: +m[5] };
}

async function parseReminderWithLLM(text, now, env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = env.OPENAI_BASE_URL || 'https://api.gapgpt.app/v1';
  const model = env.OPENAI_MODEL || 'gpt-5.6-luna';

  const pad = (n) => String(n).padStart(2, '0');
  const nowIsoLocal = `${now.y}-${pad(now.m)}-${pad(now.d)}T${pad(now.hour)}:${pad(now.minute)}`;

  const userPrompt =
    `Current local datetime: ${nowIsoLocal}\n` +
    `The datetime above is the reference clock for this request.\n` +
    `Return the exact local datetime represented by the user.\n` +
    `User message: ${text}`;

  try {
    const res = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: LLM_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        text: { format: { type: 'json_schema', name: 'reminder_parse', strict: true, schema: LLM_SCHEMA } },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();

    let raw = data.output_text;
    if (!raw && Array.isArray(data.output)) {
      outer: for (const item of data.output) {
        if (Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === 'output_text' && c.text) {
              raw = c.text;
              break outer;
            }
          }
        }
      }
    }
    if (!raw) return null;

    const parsed = JSON.parse(String(raw).trim());
    if (parsed.intent !== 'create_reminder') return null;

    const description = String(parsed.description || '').trim();
    const remindAtRaw = String(parsed.remind_at || '').trim();
    if (!description || !remindAtRaw) return null;

    const remindAt = parseLocalIso(remindAtRaw);
    if (!remindAt) return null;
    if (remindAt.hour < 0 || remindAt.hour > 23 || remindAt.minute < 0 || remindAt.minute > 59) return null;

    return { description, remindAt };
  } catch (e) {
    // API/network/model errors must never take the bot down.
    return null;
  }
}

// ============================================================================
// Timezone helpers — TIMEZONE_OFFSET_MINUTES defines the fixed local offset
// used for parsing/display. D1 always stores true UTC instants.
// ============================================================================

function tzOffsetMinutes(env) {
  const v = Number(env.TIMEZONE_OFFSET_MINUTES);
  return Number.isFinite(v) ? v : 210; // default: Iran Standard Time, UTC+3:30
}

function nowParts(env) {
  const localMs = Date.now() + tzOffsetMinutes(env) * 60000;
  const d = new Date(localMs);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

function localPartsToUtcInstantMs(parts, env) {
  const localMs = Date.UTC(parts.y, parts.m - 1, parts.d, parts.hour, parts.minute, 0);
  return localMs - tzOffsetMinutes(env) * 60000;
}

function utcIsoToLocalParts(iso, env) {
  const ms = new Date(iso).getTime() + tzOffsetMinutes(env) * 60000;
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

function formatWhen(parts, lang) {
  const wd = weekdayOf(parts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${TEXTS[lang].weekday[wd]} ${parts.y}-${pad(parts.m)}-${pad(parts.d)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fullName(from) {
  return [from.first_name, from.last_name].filter(Boolean).join(' ') || null;
}

function parseAdmins(env) {
  return (env.ADMINS || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

// ============================================================================
// D1 data access (ported from models.py / operations.py)
// ============================================================================

let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      full_name TEXT,
      join_date TEXT DEFAULT (datetime('now')),
      is_blocked INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'en'
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      is_sent INTEGER NOT NULL DEFAULT 0
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS bot_state (
      user_id INTEGER PRIMARY KEY,
      state TEXT
    )`),
  ]);
  schemaReady = true;
}

async function getUser(env, userId) {
  return env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
}

async function insertUser(env, userId, name, username, language) {
  await env.DB.prepare('INSERT INTO users (user_id, full_name, username, language) VALUES (?, ?, ?, ?)')
    .bind(userId, name ?? null, username ?? null, language)
    .run();
}

async function getUsers(env) {
  const { results } = await env.DB.prepare('SELECT * FROM users').all();
  return results;
}

async function setUserLanguage(env, userId, language) {
  if (language !== 'fa' && language !== 'en') return false;
  const res = await env.DB.prepare('UPDATE users SET language = ? WHERE user_id = ?').bind(language, userId).run();
  return res.meta.changes > 0;
}

async function insertReminder(env, userId, chatId, text, remindAtIso) {
  const res = await env.DB.prepare('INSERT INTO reminders (user_id, chat_id, text, remind_at) VALUES (?, ?, ?, ?)')
    .bind(userId, chatId, text, remindAtIso)
    .run();
  return res.meta.last_row_id;
}

async function getUserReminders(env, userId) {
  const { results } = await env.DB.prepare('SELECT * FROM reminders WHERE user_id = ? AND is_sent = 0 ORDER BY remind_at ASC')
    .bind(userId)
    .all();
  return results;
}

async function deleteReminder(env, reminderId, userId) {
  const res = await env.DB.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').bind(reminderId, userId).run();
  return res.meta.changes > 0;
}

async function getDueReminders(env, nowIso) {
  const { results } = await env.DB.prepare('SELECT * FROM reminders WHERE is_sent = 0 AND remind_at <= ?').bind(nowIso).all();
  return results;
}

async function markReminderSent(env, reminderId) {
  await env.DB.prepare('UPDATE reminders SET is_sent = 1 WHERE id = ?').bind(reminderId).run();
}

async function getState(env, userId) {
  const row = await env.DB.prepare('SELECT state FROM bot_state WHERE user_id = ?').bind(userId).first();
  return row ? row.state : null;
}

async function setState(env, userId, state) {
  await env.DB.prepare(
    'INSERT INTO bot_state (user_id, state) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET state = excluded.state'
  )
    .bind(userId, state)
    .run();
}

async function clearState(env, userId) {
  await env.DB.prepare('DELETE FROM bot_state WHERE user_id = ?').bind(userId).run();
}

async function ensureUser(env, from) {
  let user = await getUser(env, from.id);
  if (!user) {
    const langCode = (from.language_code || '').toLowerCase();
    const language = langCode.startsWith('fa') ? 'fa' : 'en';
    await insertUser(env, from.id, fullName(from), from.username ?? null, language);
    user = await getUser(env, from.id);
  }
  return user;
}

// ============================================================================
// Telegram Bot API helpers
// ============================================================================

async function tg(env, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error in ${method}:`, data.description);
  }
  return data;
}

function menu(lang) {
  return {
    keyboard: [
      [
        {
          text: t(lang, 'my_reminders'),
          style: 'success',
        },
        {
          text: t(lang, 'help'),
          style: 'primary',
        },
      ],
      [
        {
          text: t(lang, 'contact'),
          style: 'danger',
        },
        {
          text: t(lang, 'language_button'),
          style: 'primary',
        },
      ],
    ],
    resize_keyboard: true,
  };
}

function languageMarkup() {
  return { inline_keyboard: [[{ text: '🇮🇷 فارسی', callback_data: 'lang:fa' }, { text: '🇬🇧 English', callback_data: 'lang:en' }]] };
}

function remindersMarkup(reminders, lang) {
  return { inline_keyboard: reminders.map((r) => [{ text: t(lang, 'delete', { id: r.id }), callback_data: `delete_reminder:${r.id}` }]) };
}

function contactMarkup() {
  return {
    inline_keyboard: [
      [{ text: 'Telegram', url: 'https://t.me/Lowkasra', style: 'primary' }],
      [{ text: 'LinkedIn', url: 'https://www.linkedin.com/in/kasrakarimian/' , style: 'success'}],
      [{ text: 'GitHub', url: 'https://github.com/kasrakr' }],
      [{ text: 'Buy Me a Coffee!', url: 'https://coffeebede.com/highkasra', style: 'danger' }],
    ],
  };
}



// ============================================================================
// Handlers (ported from main.py)
// ============================================================================

function reminderLine(r, lang, env) {
  const parts = utcIsoToLocalParts(r.remind_at, env);
  return `🆔 #${r.id}\n📝 ${r.text}\n🗓 ${formatWhen(parts, lang)}\n\n`;
}

async function showUserReminders(env, chatId, userId, lang) {
  const reminders = await getUserReminders(env, userId);
  if (reminders.length === 0) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: t(lang, 'no_reminders'), reply_markup: menu(lang) });
    return;
  }
  let text = t(lang, 'reminders_title') + '\n\n';
  for (const r of reminders) text += reminderLine(r, lang, env);
  await tg(env, 'sendMessage', { chat_id: chatId, text, reply_markup: remindersMarkup(reminders, lang) });
}

async function handleStart(env, message, user) {
  const lang = user ? user.language : 'en';
  const markup = {
    inline_keyboard: [
      [{ text: t(lang, 'help'), callback_data: 'help', style: 'primary' }],
      [{ text: t(lang, 'language_button'), callback_data: 'language', style: 'success' }],
    ],
  };
  const name = escapeHtml(message.from.first_name || '');
  const caption = t(lang, 'welcome', { name: `<b>${name}</b>` });
  if (env.WELCOME_PHOTO_URL) {
    await tg(env, 'sendPhoto', { chat_id: message.chat.id, photo: env.WELCOME_PHOTO_URL, caption, parse_mode: 'HTML', reply_markup: markup });
  } else {
    await tg(env, 'sendMessage', { chat_id: message.chat.id, text: caption, parse_mode: 'HTML', reply_markup: markup });
  }
  await tg(env, 'sendMessage', { chat_id: message.chat.id, text: t(lang, 'menu_ready'), reply_markup: menu(lang) });
}

async function handleBroadcastCommand(env, message) {
  await tg(env, 'sendMessage', { chat_id: message.chat.id, text: `Send your Message Admin ${fullName(message.from) || ''}` });
  await setState(env, message.from.id, 'BRD');
}

async function handleBroadcastMessage(env, message) {
  const users = await getUsers(env);
  for (const u of users) {
    try {
      await tg(env, 'copyMessage', { chat_id: u.user_id, from_chat_id: message.chat.id, message_id: message.message_id });
    } catch (e) {
      // best-effort broadcast: one blocked/unreachable user shouldn't stop the rest
    }
  }
  await clearState(env, message.from.id);
  await tg(env, 'sendMessage', { chat_id: message.chat.id, text: 'Broadcast is Finished' });
}

async function handleSetReminder(env, message, user) {
  const lang = user ? user.language : 'en';

  // --- ADD CHARACTER LIMIT CHECK HERE ---
 const charCount = [...(message.text || '')].length;

if (charCount > 700) {
  const text = lang === 'fa'
    ? '⚠️ متن یادآوری نباید بیشتر از ۷۰۰ کاراکتر باشد.'
    : '⚠️ Your reminder message cannot exceed 700 characters.';

  await tg(env, 'sendMessage', {
    chat_id: message.chat.id,
    text,
    reply_markup: menu(lang),
  });
  return;
}

  const now = nowParts(env);
  let parsed = parseReminderPersian(message.text, now);
  if (!parsed) parsed = await parseReminderWithLLM(message.text, now, env);
  if (!parsed) {
    await tg(env, 'sendMessage', { chat_id: message.chat.id, text: t(lang, 'parse_error'), reply_markup: menu(lang) });
    return;
  }
  const { description, remindAt } = parsed;
  const remindAtIso = new Date(localPartsToUtcInstantMs(remindAt, env)).toISOString();
  await insertReminder(env, message.from.id, message.chat.id, description, remindAtIso);
  try {
    await tg(env, 'setMessageReaction', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      reaction: [{ type: 'emoji', emoji: '❤️‍🔥' }],
    });
  } catch (e) {
    // reactions are cosmetic; never let this block scheduling
  }
  await tg(env, 'sendMessage', {
    chat_id: message.chat.id,
    text: t(lang, 'scheduled', { description, when: formatWhen(remindAt, lang) }),
    reply_markup: menu(lang),
  });
}

async function handleMessage(env, message) {
  if (!message.from) return;
  const user = await ensureUser(env, message.from);
  if (user && user.is_blocked) return;

  const lang = user ? user.language : 'en';
  const text = message.text;

  if (text === '/start' || (text && text.startsWith('/start '))) {
    await handleStart(env, message, user);
    return;
  }

  if (text === '/broad' && parseAdmins(env).includes(message.from.id)) {
    await handleBroadcastCommand(env, message);
    return;
  }

  const state = await getState(env, message.from.id);
  if (state === 'BRD') {
    await handleBroadcastMessage(env, message);
    return;
  }

if (text === t(lang, 'language_button')) {
  await tg(env, 'sendMessage', {
    chat_id: message.chat.id,
    text: t(lang, 'choose_language'),
    reply_markup: languageMarkup(),
  });
  return;
}

if (text === t(lang, 'help')) {
  await tg(env, 'sendMessage', {
    chat_id: message.chat.id,
    text: t(lang, 'help_text'),
    reply_markup: menu(lang),
  });
  return;
}

if (text === t(lang, 'contact')) {
  await tg(env, 'sendMessage', {
    chat_id: message.chat.id,
    text: t(lang, 'contact_text'),
    reply_markup: contactMarkup(),
  });
  return;
}

if (text === t(lang, 'my_reminders')) {
  await showUserReminders(
    env,
    message.chat.id,
    message.from.id,
    lang
  );
  return;
}
  // --- ADD RATE LIMIT CHECK HERE ---
    if (env.BOT_RATE_LIMITER) {
    const { success } = await env.BOT_RATE_LIMITER.limit({
      key: `reminder:${message.from.id}`,
    });

    if (!success) {
      await tg(env, 'sendMessage', {
        chat_id: message.chat.id,
        text: lang === 'fa'
          ? '⚠️ درخواست‌هایت خیلی سریع ارسال می‌شوند. لطفاً کمی صبر کن.'
          : '⚠️ You are sending reminders too quickly. Please wait a minute.',
        reply_markup: menu(lang),
      });
      return;
    }
  }

  if (text && !text.startsWith('/')) {
    await handleSetReminder(env, message, user);
    return;
  }

  // Unrecognized command or non-text message: silently ignored, matching the original.
}

async function handleCallbackQuery(env, cb) {
  const from = cb.from;
  const user = await ensureUser(env, from);
  if (user && user.is_blocked) return;
  const lang = user ? user.language : 'en';
  const data = cb.data || '';
  const chatId = cb.message.chat.id;

  if (data === 'language') {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: t(lang, 'choose_language'),
      reply_markup: languageMarkup(),
    });

    await tg(env, 'answerCallbackQuery', {
      callback_query_id: cb.id,
    });

  return;
}

  if (data.startsWith('lang:')) {
    const language = data.split(':')[1];
    if (language !== 'fa' && language !== 'en') {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Invalid language', show_alert: true });
      return;
    }
    await setUserLanguage(env, from.id, language);
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    const msg = language === 'fa' ? t('fa', 'language_changed') : t('en', 'language_changed_en');
    await tg(env, 'sendMessage', { chat_id: chatId, text: msg, reply_markup: menu(language) });
    return;
  }

  if (data === 'help') {
    await tg(env, 'sendMessage', { chat_id: chatId, text: t(lang, 'help_text'), reply_markup: menu(lang) });
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    return;
  }

  if (data === 'contact') {
    await tg(env, 'sendMessage', { chat_id: chatId, text: t(lang, 'contact_text') });
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    return;
  }

  if (data.startsWith('delete_reminder:')) {
    const reminderId = parseInt(data.split(':')[1], 10);
    if (Number.isNaN(reminderId)) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, 'invalid_reminder'), show_alert: true });
      return;
    }
    const markup = {
      inline_keyboard: [[
        { text: t(lang, 'yes_delete'), callback_data: `confirm_delete:${reminderId}`, style:'success' },
        { text: t(lang, 'cancel'), callback_data: 'cancel_delete' ,style: 'danger'},
      ]],
    };
    await tg(env, 'sendMessage', { chat_id: chatId, text: t(lang, 'confirm_delete', { id: reminderId }), reply_markup: markup });
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    return;
  }

  if (data.startsWith('confirm_delete:')) {
    const reminderId = parseInt(data.split(':')[1], 10);
    if (Number.isNaN(reminderId)) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, 'invalid_reminder'), show_alert: true });
      return;
    }
    const deleted = await deleteReminder(env, reminderId, from.id);
    if (!deleted) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, 'not_found'), show_alert: true });
      return;
    }
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, 'deleted') });
    try {
      await tg(env, 'deleteMessage', { chat_id: chatId, message_id: cb.message.message_id });
    } catch (e) {
      /* ignore */
    }
    const reminders = await getUserReminders(env, from.id);
    if (reminders.length > 0) {
      let text = t(lang, 'reminders_title') + '\n\n';
      for (const r of reminders) text += reminderLine(r, lang, env);
      await tg(env, 'sendMessage', { chat_id: chatId, text, reply_markup: remindersMarkup(reminders, lang) });
    } else {
      await tg(env, 'sendMessage', { chat_id: chatId, text: t(lang, 'no_reminders'), reply_markup: menu(lang) });
    }
    return;
  }

  if (data === 'cancel_delete') {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: t(lang, 'cancelled') });
    try {
      await tg(env, 'deleteMessage', { chat_id: chatId, message_id: cb.message.message_id });
    } catch (e) {
      /* ignore */
    }
  }
}

// ============================================================================
// Worker entry points
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response('RemindTel worker is running.', { status: 200 });
    }

    // One-time convenience route: registers this Worker's URL as the
    // Telegram webhook. Safe to call again any time the URL changes.
    if (request.method === 'GET' && url.pathname === '/install') {
      await ensureSchema(env);
      const params = { url: `${url.origin}/webhook`, allowed_updates: ['message', 'callback_query'] };
      if (env.WEBHOOK_SECRET) params.secret_token = env.WEBHOOK_SECRET;
      const result = await tg(env, 'setWebhook', params);
      return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST' && url.pathname === '/webhook') {
      if (env.WEBHOOK_SECRET) {
        const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (secretHeader !== env.WEBHOOK_SECRET) {
          return new Response('Forbidden', { status: 403 });
        }
      }

      let update;
      try {
        update = await request.json();
      } catch (e) {
        return new Response('Bad Request', { status: 400 });
      }

      await ensureSchema(env);

      // Respond to Telegram immediately; keep processing in the background
      // via waitUntil so slow steps (LLM fallback, D1 writes) don't cause
      // Telegram to retry the webhook delivery.
      ctx.waitUntil(
        (async () => {
          try {
            if (update.message) await handleMessage(env, update.message);
            else if (update.callback_query) await handleCallbackQuery(env, update.callback_query);
          } catch (e) {
            console.error('Error handling update:', e);
          }
        })()
      );

      return new Response('OK', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  },

  // Cron Trigger handler — replaces APScheduler. Configure the schedule in
  // wrangler.toml, e.g. every minute: [triggers] crons = ["* * * * *"]
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env);
        const nowIso = new Date().toISOString();
        const due = await getDueReminders(env, nowIso);
        for (const r of due) {
          try {
            const user = await getUser(env, r.user_id);
            const lang = user ? user.language : 'en';
            const title = lang === 'fa' ? '⏰ یادآوری' : '⏰ Reminder';
            await tg(env, 'sendMessage', { chat_id: r.chat_id, text: `${title}:\n${r.text}` });
          } catch (e) {
            console.error(`Failed to send reminder ${r.id}:`, e);
          } finally {
            await markReminderSent(env, r.id);
          }
        }
      })()
    );
  },
};
