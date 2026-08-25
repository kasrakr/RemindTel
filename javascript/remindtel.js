/*
 * RemindTel - single-file JavaScript/Node.js port
 *
 * Dependencies:
 *   npm i grammy better-sqlite3
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN=...
 *   ADMINS=123456789
 *   OPENAI_API_KEY=...              (optional LLM fallback)
 *   OPENAI_MODEL=gpt-5.6-luna      (optional)
 *
 * The LLM endpoint intentionally matches the original Python project:
 * https://api.gapgpt.app/v1
 */

const { Bot, InlineKeyboard, Keyboard } = require("grammy");
const Database = require("better-sqlite3");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");

const ADMINS = new Set(
  String(process.env.ADMINS || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(Number.isFinite)
);

const bot = new Bot(TOKEN);
const db = new Database("aiogram.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  username VARCHAR(128) UNIQUE,
  full_name VARCHAR(128),
  join_date TEXT NOT NULL,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  language VARCHAR(2) NOT NULL DEFAULT 'en'
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  text VARCHAR(512) NOT NULL,
  remind_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_sent INTEGER NOT NULL DEFAULT 0
);
`);

const TEXTS = {
  fa: {
    language_button: "🌐 تغییر زبان", my_reminders: "یادآوری های من⏱️", contact: "تماس📞", help: "راهنما❓",
    welcome: "به ربات RemindTel خوش آمدید {name} عزیز!", menu_ready: "از منوی زیر استفاده کن یا درخواستت را به صورت طبیعی بنویس.",
    choose_language: "🌐 زبان ربات را انتخاب کنید:", language_changed: "زبان ربات روی فارسی تنظیم شد 🇮🇷", language_changed_en: "Bot language changed to English 🇬🇧",
    help_text: "⚪ برای تنظیم یادآوری، درخواستت را طبیعی بنویس.\n\nمثال‌ها:\n• فردا ساعت ۵ به متین زنگ بزن\n• روز قبل کریسمس ساعت ۹ می‌خوام برم فوتبال\n• یک ربع به سه یادم بنداز با مسعود تماس بگیرم\n• ساعت دو و نیم یادم بنداز پروژه رو commit کنم",
    contact_text: "خوشحال می‌شم نظراتت رو ببینم:", no_reminders: "⏱️ شما هیچ یادآوری‌ای ندارید.", reminders_title: "📋 یادآوری‌های شما:",
    delete: "🗑 حذف #{id}", confirm_delete: "⚠️ مطمئنی می‌خواهی یادآوری #{id} حذف شود؟", yes_delete: "✅ بله، حذفش کن", cancel: "❌ لغو",
    deleted: "یادآوری حذف شد ✅", cancelled: "حذف لغو شد.", invalid_reminder: "یادآوری نامعتبر است.", not_found: "این یادآوری پیدا نشد یا متعلق به شما نیست.",
    parse_error: "متوجه یادآوری شما نشدم 🙁\nمثال: فردا حدود ساعت پنج به متین زنگ بزن", scheduled: "✅ یادآوری تنظیم شد:\n📝 {description}\n🗓 {when}",
    weekday: ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"]
  },
  en: {
    language_button: "🌐 Change language", my_reminders: "⏱️ My Reminders", contact: "📞 Contact", help: "❓ Help",
    welcome: "Welcome to RemindTel, {name}!", menu_ready: "Use the menu below or write your reminder naturally.",
    choose_language: "🌐 Choose your bot language:", language_changed: "Bot language changed to Persian 🇮🇷", language_changed_en: "Bot language changed to English 🇬🇧",
    help_text: "⚪ Set reminders by writing naturally.\n\nExamples:\n• Remind me to call Matin tomorrow at 5 PM\n• I want to play football at 9 AM the day before Christmas\n• Remind me at a quarter to three to call Masoud\n• Remind me half an hour after two to commit the project",
    contact_text: "I’d love to hear your feedback:", no_reminders: "⏱️ You have no reminders.", reminders_title: "📋 Your reminders:",
    delete: "🗑 Delete #{id}", confirm_delete: "⚠️ Are you sure you want to delete reminder #{id}?", yes_delete: "✅ Yes, delete it", cancel: "❌ Cancel",
    deleted: "Reminder deleted ✅", cancelled: "Deletion cancelled.", invalid_reminder: "Invalid reminder.", not_found: "This reminder was not found or does not belong to you.",
    parse_error: "I couldn't understand your reminder 🙁\nExample: Remind me to call Ali tomorrow around 5 PM",
    scheduled: "✅ Reminder scheduled:\n📝 {description}\n🗓 {when}",
    weekday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  }
};

function t(lang, key, vars = {}) {
  let value = (TEXTS[lang] || TEXTS.en)[key];
  if (typeof value === "string") for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{${k}}`, String(v));
  return value;
}

function isoLocal(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function parseLocalIso(s) { return new Date(s.includes("Z") ? s : s.replace(" ", "T")); }
function langOf(user) { return user?.language || "en"; }

function ensureUser(from) {
  let user = db.prepare("SELECT * FROM users WHERE user_id = ?").get(from.id);
  if (!user) {
    const telegramLanguage = String(from.language_code || "").toLowerCase();
    const language = telegramLanguage.startsWith("fa") ? "fa" : "en";
    db.prepare("INSERT INTO users (user_id, username, full_name, join_date, is_blocked, language) VALUES (?, ?, ?, ?, 0, ?)")
      .run(from.id, from.username || null, from.first_name ? `${from.first_name}${from.last_name ? ` ${from.last_name}` : ""}` : null, isoLocal(new Date()), language);
    user = db.prepare("SELECT * FROM users WHERE user_id = ?").get(from.id);
  }
  return user;
}

function menu(lang) {
  return new Keyboard()
    .text(t(lang, "my_reminders")).text(t(lang, "help")).row()
    .text(t(lang, "contact")).text(t(lang, "language_button")).resized();
}
function languageKeyboard() {
  return new InlineKeyboard().text("🇮🇷 فارسی", "lang:fa").text("🇬🇧 English", "lang:en");
}
function formatWhen(date, lang) {
  const p = n => String(n).padStart(2, "0");
  return `${TEXTS[lang].weekday[date.getDay() === 0 ? 6 : date.getDay()-1]} ${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

const pendingTimers = new Map();
function getUserReminders(userId) { return db.prepare("SELECT * FROM reminders WHERE user_id = ? AND is_sent = 0 ORDER BY remind_at").all(userId); }
function deleteReminder(id, userId) { return db.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").run(id, userId).changes > 0; }

function cancelReminder(id) {
  const timer = pendingTimers.get(id);
  if (timer) clearTimeout(timer);
  pendingTimers.delete(id);
}

function scheduleReminder(reminder) {
  cancelReminder(reminder.id);
  const runAt = parseLocalIso(reminder.remind_at);
  const delay = Math.max(0, runAt.getTime() - Date.now());
  const timer = setTimeout(async () => {
    try {
      const user = db.prepare("SELECT language FROM users WHERE user_id = ?").get(reminder.user_id);
      const title = user?.language === "fa" ? "⏰ یادآوری" : "⏰ Reminder";
      await bot.api.sendMessage(reminder.chat_id, `${title}:\n${reminder.text}`);
    } catch (_) {}
    finally {
      db.prepare("UPDATE reminders SET is_sent = 1 WHERE id = ?").run(reminder.id);
      pendingTimers.delete(reminder.id);
    }
  }, delay > 2147483647 ? 2147483647 : delay);
  pendingTimers.set(reminder.id, timer);
  if (delay > 2147483647) setTimeout(() => scheduleReminder(db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminder.id)), 2147483647);
}
function loadPendingReminders() { for (const r of db.prepare("SELECT * FROM reminders WHERE is_sent = 0").all()) scheduleReminder(r); }

// ---------------- Persian natural-time parser ----------------
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const WEEKDAYS = { "شنبه":5,"یک شنبه":6,"یکشنبه":6,"یک‌شنبه":6,"دو شنبه":0,"دوشنبه":0,"دو‌شنبه":0,"سه شنبه":1,"سه‌شنبه":1,"چهار شنبه":2,"چهارشنبه":2,"چهار‌شنبه":2,"پنج شنبه":3,"پنجشنبه":3,"پنج‌شنبه":3,"جمعه":4,"آخر هفته":4,"آخرهفته":4 };
const RELATIVE_DAYS = { "پس فردا":2,"پس‌فردا":2,"پسفردا":2,"فردا":1,"امروز":0,"امشب":0 };
const HOUR_WORDS = { "یک":1,"دو":2,"سه":3,"چهار":4,"پنج":5,"شش":6,"هفت":7,"هشت":8,"نه":9,"ده":10,"یازده":11,"دوازده":12 };
const PERIOD_WORDS = ["بعدازظهر","بعد از ظهر","صبح","ظهر","عصر","شب"];
function altKey(o) { return Object.keys(o).sort((a,b)=>b.length-a.length).join("|").replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
const timeRe = new RegExp(`(?:(${altKey(Object.fromEntries(PERIOD_WORDS.map(x=>[x,1])))})\\s+)?ساعت\\s*(\\d{1,2}|${altKey(HOUR_WORDS)})(?::(\\d{2}))?(?:\\s*(و)?\\s*(نیم|ربع))?\\s*(${altKey(Object.fromEntries(PERIOD_WORDS.map(x=>[x,1])))})?`);
const quarterRe = new RegExp(`(?:یک\\s+)?ربع\\s+به\\s+(\\d{1,2}|${altKey(HOUR_WORDS)})`);
const halfAfterRe = new RegExp(`نیم\\s+ساعت\\s+بعد(?:\\s+از)?\\s+(?:ساعت\\s+)?(\\d{1,2}|${altKey(HOUR_WORDS)})`);
const hourHalfRe = new RegExp(`(?:ساعت\\s+)?(\\d{1,2}|${altKey(HOUR_WORDS)})\\s+و\\s+نیم`);
const offsetRe = new RegExp(`(?:(\\d+|${altKey(HOUR_WORDS)})\\s+)?(روز|هفته|ماه|سال)[‌ ]?(?:ی[‌ ]?)?(?:دیگه|دیگر|بعد)`);
const periodRe = new RegExp(altKey(Object.fromEntries(PERIOD_WORDS.map(x=>[x,1]))));
const unresolvedDateRe = /عید|هفته|رمضان|نوروز|یلدا|چهارشنبه[‌ ]?سوری|تاسوعا|عاشورا|(روز|شب)\s+(قبل|بعد)|مونده\s+به|مانده\s+به/;
const FILLERS = ["برای","در","روز","ساعت","حدود","تقریبا","تقریباً"];
function normalize(s) { return s.split("").map(c => { const i=PERSIAN_DIGITS.indexOf(c); return i>=0?String(i):c; }).join(""); }
function hourToken(x) { return HOUR_WORDS[x.trim()] || Number(x); }
function addMonths(d, months) { const x=new Date(d); const wanted=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+months); x.setDate(Math.min(wanted,new Date(x.getFullYear(),x.getMonth()+1,0).getDate())); return x; }
function addYears(d, years) { const x=new Date(d); const wanted=x.getDate(); x.setDate(1); x.setFullYear(x.getFullYear()+years); x.setDate(Math.min(wanted,new Date(x.getFullYear(),x.getMonth()+1,0).getDate())); return x; }
function applyPeriod(hour, period) { period=(period||"").replaceAll(" ","").replaceAll("‌",""); if(period==="صبح")return hour===12?0:hour; if(period==="ظهر")return 12; if(["عصر","بعدازظهر"].includes(period))return hour<12?hour+12:hour; if(period==="شب")return hour===12?0:hour+12; return hour; }
function naturalHour(h) { if(h===12)return 12; if(h>=7&&h<=11)return h; if(h>=1&&h<=6)return h+12; return h; }
function stripSpans(text, spans) { let out=text, sorted=[...spans].sort((a,b)=>b[0]-a[0]); for(const [s,e] of sorted) out=out.slice(0,s)+out.slice(e); for(const w of FILLERS) out=out.replace(new RegExp(`(?:^|\\s)${w}(?=\\s|$)`,"g")," "); return out.replace(/\s+/g," ").trim().replace(/^[ \\t\\n\\r،,.:؛-]+|[ \\t\\n\\r،,.:؛-]+$/g,""); }

function parseReminder(input, now=new Date()) {
  let text=normalize(input), spans=[], targetDate=null, matchedDay=null, weekdayMatch=false;
  for(const [word,off] of Object.entries(RELATIVE_DAYS).sort((a,b)=>b[0].length-a[0].length)) { const i=text.indexOf(word); if(i!==-1){ const d=new Date(now); d.setDate(d.getDate()+off); targetDate=new Date(d.getFullYear(),d.getMonth(),d.getDate()); matchedDay=word; spans.push([i,i+word.length]); break; } }
  if(!targetDate) for(const [word,wd] of Object.entries(WEEKDAYS).sort((a,b)=>b[0].length-a[0].length)) { const i=text.indexOf(word); if(i!==-1){ const ahead=(wd- (now.getDay()===0?6:now.getDay()-1) + 7)%7; const d=new Date(now); d.setDate(d.getDate()+ahead); targetDate=new Date(d.getFullYear(),d.getMonth(),d.getDate()); matchedDay=word; weekdayMatch=true; spans.push([i,i+word.length]); break; } }
  const off=offsetRe.exec(text);
  if(off){ spans.push([off.index,off.index+off[0].length]); const count=off[1]?hourToken(off[1]):1; const unit=off[2]; if(!targetDate) targetDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); if(unit==="روز")targetDate.setDate(targetDate.getDate()+count); else if(unit==="هفته")targetDate.setDate(targetDate.getDate()+7*count); else if(unit==="ماه")targetDate=addMonths(targetDate,count); else targetDate=addYears(targetDate,count); }
  let hour=null, minute=0, m;
  if((m=quarterRe.exec(text))){ const h=naturalHour(hourToken(m[1])); const total=h*60-15; hour=Math.floor(total/60); minute=total%60; spans.push([m.index,m.index+m[0].length]); }
  if(hour===null && (m=halfAfterRe.exec(text))){ const h=naturalHour(hourToken(m[1])); const total=h*60+30; hour=Math.floor(total/60); minute=total%60; spans.push([m.index,m.index+m[0].length]); }
  if(hour===null && (m=hourHalfRe.exec(text))){ hour=naturalHour(hourToken(m[1])); minute=30; spans.push([m.index,m.index+m[0].length]); }
  if(hour===null && (m=timeRe.exec(text))){ hour=hourToken(m[2]); minute=m[3]?Number(m[3]):m[5]==="نیم"?30:m[5]==="ربع"?15:0; const period=m[6]||m[1]; hour=period?applyPeriod(hour,period):naturalHour(hour); spans.push([m.index,m.index+m[0].length]); }
  if(hour===null && (m=periodRe.exec(text))){ const p=m[0]; hour=p.replaceAll(" ","")==="صبح"?9:p.replaceAll(" ","")==="ظهر"?12:p.replaceAll(" ","")==="شب"?21:p.replaceAll(" ","")==="عصر"?17:16; spans.push([m.index,m.index+m[0].length]); }
  if(targetDate===null && hour===null)return null;
  if(targetDate===null){ if(unresolvedDateRe.test(text))return null; targetDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); }
  if(hour===null)hour=matchedDay==="امشب"?21:9;
  let remindAt=new Date(targetDate.getFullYear(),targetDate.getMonth(),targetDate.getDate(),hour,minute,0,0);
  if(remindAt<=now && targetDate.getTime()===new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()) { remindAt.setDate(remindAt.getDate()+(weekdayMatch?7:1)); }
  let description=stripSpans(text,spans)||"یادآوری";
  return [description, remindAt];
}

async function parseReminderWithLLM(text, now=new Date()) {
  const key=process.env.OPENAI_API_KEY;
  if(!key)return null;
  const model=process.env.OPENAI_MODEL||"gpt-5.6-luna";
  const system=`You are the semantic natural-language parser for a Telegram reminder bot. Convert Persian or English into one precise reminder. Return only JSON with intent=create_reminder or unknown, description, and remind_at. Use the supplied current local datetime. Preserve the activity only in description. Understand Persian relative dates, month/year offsets, natural clock expressions, and common calendar references. Never guess an uncertain date.`;
  const user=`Current local datetime: ${isoLocal(now).slice(0,16)}\nUser message: ${text}`;
  try {
    const r=await fetch("https://api.gapgpt.app/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify({model,input:[{role:"system",content:system},{role:"user",content:user}],text:{format:{type:"json_schema",name:"reminder_parse",strict:true,schema:{type:"object",properties:{intent:{type:"string",enum:["create_reminder","unknown"]},description:{type:"string"},remind_at:{type:"string"}},required:["intent","description","remind_at"],additionalProperties:false}}}})});
    if(!r.ok)return null; const data=await r.json(); const raw=data.output_text || data.output?.flatMap(x=>x.content||[]).find(x=>x.text)?.text; const parsed=JSON.parse(String(raw||""));
    if(parsed.intent!=="create_reminder"||!parsed.description||!parsed.remind_at)return null; const d=parseLocalIso(parsed.remind_at); if(Number.isNaN(d.getTime()))return null; return [String(parsed.description).trim(),d];
  } catch (_) { return null; }
}

async function showUserReminders(ctx, lang) {
  const reminders=getUserReminders(ctx.from.id); if(!reminders.length){ await ctx.reply(t(lang,"no_reminders"),{reply_markup:menu(lang)}); return; }
  let text=t(lang,"reminders_title")+"\n\n"; const kb=new InlineKeyboard();
  for(const r of reminders){ text+=`🆔 #${r.id}\n📝 ${r.text}\n🗓 ${formatWhen(parseLocalIso(r.remind_at),lang)}\n\n`; kb.text(t(lang,"delete",{id:r.id}),`delete_reminder:${r.id}`).row(); }
  await ctx.reply(text,{reply_markup:kb});
}

// Middleware: create users lazily and block disabled accounts.
bot.use(async (ctx,next)=>{
  if(!ctx.from)return;
  const user=ensureUser(ctx.from);
  if(user?.is_blocked)return;
  await next();
});

bot.command("start", async ctx=>{
  const user=db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id); const lang=langOf(user);
  const kb=new InlineKeyboard().text(t(lang,"help"),"help").row().text(t(lang,"language_button"),"language").row().text(t(lang,"contact"),"contact");
  await ctx.replyWithPhoto("https://raw.githubusercontent.com/kasrakr/RemindTel/main/docs/2.png",{caption:t(lang,"welcome",{name:`<b>${ctx.from.first_name||""}</b>`}),parse_mode:"HTML",reply_markup:kb});
  await ctx.reply(t(lang,"menu_ready"),{reply_markup:menu(lang)});
});

bot.command("broad", async ctx=>{
  if(!ADMINS.has(ctx.from.id))return;
  ctx.session = { broadcast:true };
  await ctx.reply(`Send your Message Admin ${ctx.from.first_name||ctx.from.id}`);
});

bot.callbackQuery("language", async ctx=>{ await ctx.answerCallbackQuery(); await ctx.reply(t(langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)),"choose_language"),{reply_markup:languageKeyboard()}); });
bot.callbackQuery("help", async ctx=>{ await ctx.answerCallbackQuery(); const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); await ctx.reply(t(lang,"help_text"),{reply_markup:menu(lang)}); });
bot.callbackQuery("contact", async ctx=>{ await ctx.answerCallbackQuery(); const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); const kb=new InlineKeyboard().url("Telegram","https://t.me/Lowkasra").row().url("LinkedIn","https://www.linkedin.com/in/kasrakarimian/").row().url("GitHub","https://github.com/kasrakr").row().url("Buy Me a Coffee!","https://coffeebede.com/highkasra"); await ctx.reply(t(lang,"contact_text"),{reply_markup:kb}); });
bot.callbackQuery(/^lang:(fa|en)$/, async ctx=>{ const language=ctx.match[1]; db.prepare("UPDATE users SET language=? WHERE user_id=?").run(language,ctx.from.id); await ctx.answerCallbackQuery(); await ctx.reply(language==="fa"?t("fa","language_changed"):t("en","language_changed_en"),{reply_markup:menu(language)}); });

bot.callbackQuery(/^delete_reminder:(\d+)$/, async ctx=>{ const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); const id=Number(ctx.match[1]); const kb=new InlineKeyboard().text(t(lang,"yes_delete"),`confirm_delete:${id}`).text(t(lang,"cancel"),"cancel_delete"); await ctx.answerCallbackQuery(); await ctx.reply(t(lang,"confirm_delete",{id}),{reply_markup:kb}); });
bot.callbackQuery(/^confirm_delete:(\d+)$/, async ctx=>{ const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); const id=Number(ctx.match[1]); if(!deleteReminder(id,ctx.from.id)){await ctx.answerCallbackQuery(t(lang,"not_found"),{show_alert:true});return;} cancelReminder(id); await ctx.answerCallbackQuery(t(lang,"deleted")); try{await ctx.deleteMessage();}catch(_){} await showUserReminders(ctx,lang); });
bot.callbackQuery("cancel_delete", async ctx=>{ const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); await ctx.answerCallbackQuery(t(lang,"cancelled")); try{await ctx.deleteMessage();}catch(_){} });

bot.hears(["🌐 تغییر زبان","🌐 Change language"], async ctx=>{ await ctx.reply(t(langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)),"choose_language"),{reply_markup:languageKeyboard()}); });
bot.hears(["راهنما❓","❓ Help"], async ctx=>{ const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); await ctx.reply(t(lang,"help_text"),{reply_markup:menu(lang)}); });
bot.hears(["تماس📞","📞 Contact"], async ctx=>{ const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); const kb=new InlineKeyboard().url("Telegram","https://t.me/Lowkasra").row().url("LinkedIn","https://www.linkedin.com/in/kasrakarimian/").row().url("GitHub","https://github.com/kasrakr").row().url("Buy Me a Coffee!","https://coffeebede.com/highkasra"); await ctx.reply(t(lang,"contact_text"),{reply_markup:kb}); });
bot.hears(["یادآوری های من⏱️","⏱️ My Reminders"], async ctx=>{ const lang=langOf(db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id)); await showUserReminders(ctx,lang); });

bot.on("message:text", async ctx=>{
  if(String(ctx.message.text).startsWith("/"))return;
  // Admin broadcast mode is per-process, mirroring the original in-memory state.
  if(ctx.session?.broadcast && ADMINS.has(ctx.from.id)){
    for(const user of db.prepare("SELECT user_id FROM users").all()){
      try { await ctx.api.copyMessage(user.user_id,ctx.chat.id,ctx.message.message_id); } catch (_) {}
    }
    ctx.session.broadcast=false; await ctx.reply("Broadcast is Finished"); return;
  }
  const user=db.prepare("SELECT * FROM users WHERE user_id=?").get(ctx.from.id); const lang=langOf(user);
  let parsed=parseReminder(ctx.message.text);
  if(!parsed)parsed=await parseReminderWithLLM(ctx.message.text);
  if(!parsed){await ctx.reply(t(lang,"parse_error"),{reply_markup:menu(lang)});return;}
  const [description,remindAt]=parsed;
  const info=db.prepare("INSERT INTO reminders (user_id,chat_id,text,remind_at,created_at,is_sent) VALUES (?,?,?,?,?,0)").run(ctx.from.id,ctx.chat.id,description,isoLocal(remindAt),isoLocal(new Date()));
  const reminder=db.prepare("SELECT * FROM reminders WHERE id=?").get(info.lastInsertRowid);
  scheduleReminder(reminder);
  try{await ctx.react?.("❤️‍🔥");}catch(_){}
  await ctx.reply(t(lang,"scheduled",{description,when:formatWhen(remindAt,lang)}),{reply_markup:menu(lang)});
});

bot.catch(err=>console.error("RemindTel error:",err.error));
loadPendingReminders();
bot.start({ onStart: info => console.log(`RemindTel running as @${info.username}`) });
