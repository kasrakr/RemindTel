import { Bot, InlineKeyboard, Keyboard, webhookCallback } from "grammy";

const schemaCache = new WeakMap();
const botCache = new Map();

const TEXTS = {
  fa: {
    language_button: "🌐 تغییر زبان", my_reminders: "یادآوری های من⏱️", contact: "تماس📞", help: "راهنما❓",
    welcome: "به ربات RemindTel خوش آمدید {name} عزیز!", menu_ready: "از منوی زیر استفاده کن یا درخواستت را به صورت طبیعی بنویس.",
    choose_language: "🌐 زبان ربات را انتخاب کنید:", language_changed: "زبان ربات روی فارسی تنظیم شد 🇮🇷", language_changed_en: "Bot language changed to English 🇬🇧",
    help_text: "⚪ برای تنظیم یادآوری، درخواستت را طبیعی بنویس.\n\nمثال‌ها:\n• فردا ساعت ۵ به متین زنگ بزن\n• روز قبل کریسمس ساعت ۹ می‌خوام برم فوتبال\n• یک ربع به سه یادم بنداز با مسعود تماس بگیرم\n• ساعت دو و نیم یادم بنداز پروژه رو commit کنم",
    contact_text: "خوشحال می‌شم نظراتت رو ببینم:", no_reminders: "⏱️ شما هیچ یادآوری‌ای ندارید.", reminders_title: "📋 یادآوری‌های شما:",
    delete: "🗑 حذف #{id}", confirm_delete: "⚠️ مطمئنی می‌خواهی یادآوری #{id} حذف شود؟", yes_delete: "✅ بله، حذفش کن", cancel: "❌ لغو",
    deleted: "یادآوری حذف شد ✅", cancelled: "حذف لغو شد.", not_found: "این یادآوری پیدا نشد یا متعلق به شما نیست.",
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
    deleted: "Reminder deleted ✅", cancelled: "Deletion cancelled.", not_found: "This reminder was not found or does not belong to you.",
    parse_error: "I couldn't understand your reminder 🙁\nExample: Remind me to call Ali tomorrow around 5 PM",
    scheduled: "✅ Reminder scheduled:\n📝 {description}\n🗓 {when}",
    weekday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  }
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const HOUR_WORDS = { "یک":1,"دو":2,"سه":3,"چهار":4,"پنج":5,"شش":6,"هفت":7,"هشت":8,"نه":9,"ده":10,"یازده":11,"دوازده":12 };
const WEEKDAYS = { "شنبه":5,"یک شنبه":6,"یکشنبه":6,"یک‌شنبه":6,"دو شنبه":0,"دوشنبه":0,"دو‌شنبه":0,"سه شنبه":1,"سه‌شنبه":1,"چهار شنبه":2,"چهارشنبه":2,"چهار‌شنبه":2,"پنج شنبه":3,"پنجشنبه":3,"پنج‌شنبه":3,"جمعه":4 };
const RELATIVE = { "پس فردا":2,"پس‌فردا":2,"پسفردا":2,"فردا":1,"امروز":0,"امشب":0 };
const PERIODS = ["بعدازظهر","بعد از ظهر","صبح","ظهر","عصر","شب"];
const FILLERS = ["برای","در","روز","ساعت","حدود","تقریبا","تقریباً"];

function escapeHtml(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function t(lang, key, vars = {}) { let v = (TEXTS[lang] || TEXTS.en)[key]; if (typeof v === "string") for (const [k, x] of Object.entries(vars)) v = v.replaceAll(`{${k}}`, String(x)); return v; }
function offset(env) { return Number.isFinite(Number(env.TIMEZONE_OFFSET_MINUTES)) ? Number(env.TIMEZONE_OFFSET_MINUTES) : 210; }
function wallNow(env, now = new Date()) { return new Date(now.getTime() + offset(env) * 60000); }
function wallToUtc(env, wall) { return new Date(wall.getTime() - offset(env) * 60000); }
function wallIso(wall) { const p=n=>String(n).padStart(2,"0"); return `${wall.getUTCFullYear()}-${p(wall.getUTCMonth()+1)}-${p(wall.getUTCDate())}T${p(wall.getUTCHours())}:${p(wall.getUTCMinutes())}`; }
function parseStored(s) { return new Date(String(s).endsWith("Z") ? s : `${s}Z`); }
function langOf(user) { return user?.language === "fa" ? "fa" : "en"; }
function menu(lang) { return new Keyboard().text(t(lang,"my_reminders")).text(t(lang,"help")).row().text(t(lang,"contact")).text(t(lang,"language_button")).resized(); }
function languageKeyboard() { return new InlineKeyboard().text("🇮🇷 فارسی","lang:fa").text("🇬🇧 English","lang:en"); }
function formatWhen(date, env, lang) { const d=wallNow(env,date), p=n=>String(n).padStart(2,"0"), wd=(d.getUTCDay()+6)%7; return `${TEXTS[lang].weekday[wd]} ${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; }

async function ensureSchema(db) {
  let p=schemaCache.get(db); if(p) return p;
  p=db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE NOT NULL,username TEXT UNIQUE,full_name TEXT,join_date TEXT NOT NULL,is_blocked INTEGER NOT NULL DEFAULT 0,language TEXT NOT NULL DEFAULT 'en')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,chat_id INTEGER NOT NULL,text TEXT NOT NULL,remind_at TEXT NOT NULL,created_at TEXT NOT NULL,is_sent INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS broadcast_sessions (user_id INTEGER PRIMARY KEY)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(is_sent,remind_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id,is_sent)`)
  ]);
  schemaCache.set(db,p); await p;
}

async function getUser(db,userId) { return (await db.prepare("SELECT * FROM users WHERE user_id=?").bind(userId).first()); }
async function ensureUser(db,from) {
  let u=await getUser(db,from.id); if(u) return u;
  const language=String(from.language_code||"").toLowerCase().startsWith("fa")?"fa":"en";
  await db.prepare("INSERT INTO users (user_id,username,full_name,join_date,language) VALUES (?,?,?,?,?)")
    .bind(from.id,from.username||null,[from.first_name,from.last_name].filter(Boolean).join(" ")||null,new Date().toISOString(),language).run();
  return getUser(db,from.id);
}

function regexParser(text, now=new Date()) {
  let s=text.normalize("NFKC").split("").map(c=>{const i=PERSIAN_DIGITS.indexOf(c);return i>=0?String(i):c;}).join("");
  const spans=[]; let target=null; const dayStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  for(const [w,n] of Object.entries(RELATIVE).sort((a,b)=>b[0].length-a[0].length)){const i=s.indexOf(w);if(i>=0){target=new Date(dayStart);target.setUTCDate(target.getUTCDate()+n);spans.push([i,i+w.length]);break;}}
  if(!target){for(const [w,wd] of Object.entries(WEEKDAYS).sort((a,b)=>b[0].length-a[0].length)){const i=s.indexOf(w);if(i>=0){const cur=(now.getUTCDay()+6)%7,ahead=(wd-cur+7)%7;target=new Date(dayStart);target.setUTCDate(target.getUTCDate()+ahead);spans.push([i,i+w.length]);break;}}}
  const offsetM=s.match(/(?:(\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|یازده|دوازده)\s+)?(روز|هفته|ماه|سال)[‌ ]?(?:ی[‌ ]?)?(?:دیگه|دیگر|بعد)/);
  if(offsetM){const i=offsetM.index;spans.push([i,i+offsetM[0].length]);const n=HOUR_WORDS[offsetM[1]]||Number(offsetM[1]||1);if(!target)target=new Date(dayStart);if(offsetM[2]==="روز")target.setUTCDate(target.getUTCDate()+n);else if(offsetM[2]==="هفته")target.setUTCDate(target.getUTCDate()+7*n);else if(offsetM[2]==="ماه"){const day=target.getUTCDate();target.setUTCDate(1);target.setUTCMonth(target.getUTCMonth()+n);target.setUTCDate(Math.min(day,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));}else{const day=target.getUTCDate();target.setUTCDate(1);target.setUTCFullYear(target.getUTCFullYear()+n);target.setUTCDate(Math.min(day,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));}}
  const hours=Object.keys(HOUR_WORDS).sort((a,b)=>b.length-a.length).join("|"); let hour=null,minute=0,m;
  const token=x=>HOUR_WORDS[x.trim()]||Number(x);
  if((m=s.match(new RegExp(`(?:یک\\s+)?ربع\\s+به\\s+(${hours}|\\d{1,2})`)))){const total=((token(m[1])+11)%12)*60+45;hour=Math.floor(total/60);minute=total%60;spans.push([m.index,m.index+m[0].length]);}
  if(hour===null&&(m=s.match(new RegExp(`نیم\\s+ساعت\\s+بعد(?:\\s+از)?\\s+(?:ساعت\\s+)?(${hours}|\\d{1,2})`)))){const total=(((token(m[1])-1)%12)+1)*60+30;hour=Math.floor(total/60);minute=total%60;spans.push([m.index,m.index+m[0].length]);}
  if(hour===null&&(m=s.match(new RegExp(`(?:ساعت\\s+)?(${hours}|\\d{1,2})\\s+و\\s+نیم`)))){hour=token(m[1]);minute=30;spans.push([m.index,m.index+m[0].length]);}
  const period=PERIODS.join("|");
  if(hour===null&&(m=s.match(new RegExp(`(?:(${period})\\s+)?ساعت\\s*(${hours}|\\d{1,2})(?::(\\d{2}))?(?:\\s*(?:و\\s*)?(نیم|ربع))?\\s*(${period})?`)))){hour=token(m[2]);minute=m[3]?Number(m[3]):m[4]==="نیم"?30:m[4]==="ربع"?15:0;const p=(m[5]||m[1]||"").replaceAll(" ","");if(p==="صبح")hour=hour===12?0:hour;else if(p==="ظهر")hour=12;else if(p==="عصر"||p==="بعدازظهر")hour=hour<12?hour+12:hour;else if(p==="شب")hour=hour===12?0:hour+12;else if(hour>=1&&hour<=6)hour+=12;spans.push([m.index,m.index+m[0].length]);}
  if(hour===null){const p=s.match(/صبح|ظهر|بعدازظهر|بعد از ظهر|عصر|شب/);if(p){hour=p[0].replaceAll(" ","")==="صبح"?9:p[0].replaceAll(" ","")==="ظهر"?12:p[0].replaceAll(" ","")==="شب"?21:p[0].replaceAll(" ","")==="عصر"?17:16;spans.push([p.index,p.index+p[0].length]);}}
  if(!target&&hour===null)return null;
  if(!target){if(/عید|هفته|رمضان|نوروز|یلدا|تاسوعا|عاشورا|(روز|شب)\s+(قبل|بعد)|مونده\s+به|مانده\s+به/.test(s))return null;target=new Date(dayStart);}
  if(hour===null)hour=s.includes("امشب")?21:9;
  let remind=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),target.getUTCDate(),hour,minute));
  if(remind<=now&&target.getTime()===dayStart.getTime())remind.setUTCDate(remind.getUTCDate()+1);
  let out=s;for(const [a,b] of spans.sort((a,b)=>b[0]-a[0]))out=out.slice(0,a)+out.slice(b);for(const w of FILLERS)out=out.replace(new RegExp(`(?:^|\\s)${w}(?=\\s|$)`,'g'),' ');out=out.replace(/\s+/g,' ').trim().replace(/^[،,.:؛\-\s]+|[،,.:؛\-\s]+$/g,'');
  return [out||"یادآوری",remind];
}

async function parseWithLLM(env,text) {
  if(!env.OPENAI_API_KEY)return null;
  const now=wallNow(env); const prompt=`Current local datetime: ${wallIso(now)}\nUser message: ${text}`;
  const system="Convert the Persian or English user message into one reminder. Return JSON only with intent, description, remind_at. Use the supplied local datetime. Understand relative dates, month/year offsets, natural clock phrases, and calendar references. If the date/time is uncertain, intent must be unknown. The description must contain only the task, not scheduling words.";
  try{
    const r=await fetch("https://api.gapgpt.app/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5.6-luna",input:[{role:"system",content:system},{role:"user",content:prompt}],text:{format:{type:"json_schema",name:"reminder_parse",strict:true,schema:{type:"object",properties:{intent:{type:"string",enum:["create_reminder","unknown"]},description:{type:"string"},remind_at:{type:"string"}},required:["intent","description","remind_at"],additionalProperties:false}}}})});
    if(!r.ok)return null;const j=await r.json();const raw=j.output_text||j.output?.flatMap(x=>x.content||[]).find(x=>x.text)?.text;const d=JSON.parse(String(raw||""));if(d.intent!=="create_reminder"||!d.description||!d.remind_at)return null;const wall=new Date(`${d.remind_at.replace(/Z$/,'')}Z`);if(Number.isNaN(wall.getTime()))return null;return [String(d.description).trim(),wallToUtc(env,wall)];
  }catch{return null;}
}

async function reminders(db,userId){return (await db.prepare("SELECT * FROM reminders WHERE user_id=? AND is_sent=0 ORDER BY remind_at").bind(userId).all()).results||[];}
async function showReminders(ctx,env,lang){const rows=await reminders(env.DB,ctx.from.id);if(!rows.length){await ctx.reply(t(lang,"no_reminders"),{reply_markup:menu(lang)});return;}let text=t(lang,"reminders_title")+"\n\n",kb=new InlineKeyboard();for(const r of rows){text+=`🆔 #${r.id}\n📝 ${r.text}\n🗓 ${formatWhen(parseStored(r.remind_at),env,lang)}\n\n`;kb.text(t(lang,"delete",{id:r.id}),`delete_reminder:${r.id}`).row();}await ctx.reply(text,{reply_markup:kb});}

async function processDue(env){const now=new Date().toISOString();const rows=(await env.DB.prepare("SELECT * FROM reminders WHERE is_sent=0 AND remind_at<=? ORDER BY remind_at LIMIT 100").bind(now).all()).results||[];const bot=getBot(env);for(const r of rows){const claimed=(await env.DB.prepare("UPDATE reminders SET is_sent=2 WHERE id=? AND is_sent=0").bind(r.id).run()).meta.changes===1;if(!claimed)continue;try{const u=await getUser(env.DB,r.user_id);const title=langOf(u)==="fa"?"⏰ یادآوری":"⏰ Reminder";await bot.api.sendMessage(r.chat_id,`${title}:\n${r.text}`);await env.DB.prepare("UPDATE reminders SET is_sent=1 WHERE id=?").bind(r.id).run();}catch{await env.DB.prepare("UPDATE reminders SET is_sent=0 WHERE id=?").bind(r.id).run();}}}

function getBot(env){const key=env.TELEGRAM_BOT_TOKEN;if(!key)throw new Error("Missing TELEGRAM_BOT_TOKEN secret");if(botCache.has(key))return botCache.get(key);const botInfo=env.BOT_INFO?JSON.parse(env.BOT_INFO):undefined;const bot=botInfo?new Bot(key,{botInfo}):new Bot(key);
  bot.use(async(ctx,next)=>{if(!ctx.from)return;const u=await ensureUser(env.DB,ctx.from);if(u?.is_blocked)return;await next();});
  bot.command("start",async ctx=>{const u=await getUser(env.DB,ctx.from.id),lang=langOf(u);const kb=new InlineKeyboard().text(t(lang,"help"),"help").row().text(t(lang,"language_button"),"language").row().text(t(lang,"contact"),"contact");const name=escapeHtml(ctx.from.first_name||"");await ctx.replyWithPhoto("https://raw.githubusercontent.com/kasrakr/RemindTel/main/docs/2.png",{caption:t(lang,"welcome",{name:`<b>${name}</b>`}),parse_mode:"HTML",reply_markup:kb});await ctx.reply(t(lang,"menu_ready"),{reply_markup:menu(lang)});});
  bot.command("broad",async ctx=>{if(!(String(env.ADMINS||"").split(",").map(Number).includes(ctx.from.id)))return;await env.DB.prepare("INSERT OR REPLACE INTO broadcast_sessions (user_id) VALUES (?)").bind(ctx.from.id).run();await ctx.reply(`Send your Message Admin ${ctx.from.first_name||ctx.from.id}`);});
  bot.callbackQuery("language",async ctx=>{await ctx.answerCallbackQuery();const l=langOf(await getUser(env.DB,ctx.from.id));await ctx.reply(t(l,"choose_language"),{reply_markup:languageKeyboard()});});
  bot.callbackQuery("help",async ctx=>{await ctx.answerCallbackQuery();const l=langOf(await getUser(env.DB,ctx.from.id));await ctx.reply(t(l,"help_text"),{reply_markup:menu(l)});});
  bot.callbackQuery("contact",async ctx=>{await ctx.answerCallbackQuery();const l=langOf(await getUser(env.DB,ctx.from.id));const kb=new InlineKeyboard().url("Telegram","https://t.me/Lowkasra").row().url("LinkedIn","https://www.linkedin.com/in/kasrakarimian/").row().url("GitHub","https://github.com/kasrakr").row().url("Buy Me a Coffee!","https://coffeebede.com/highkasra");await ctx.reply(t(l,"contact_text"),{reply_markup:kb});});
  bot.callbackQuery(/^lang:(fa|en)$/,async ctx=>{const l=ctx.match[1];await env.DB.prepare("UPDATE users SET language=? WHERE user_id=?").bind(l,ctx.from.id).run();await ctx.answerCallbackQuery();await ctx.reply(l==="fa"?t("fa","language_changed"):t("en","language_changed_en"),{reply_markup:menu(l)});});
  bot.callbackQuery(/^delete_reminder:(\d+)$/,async ctx=>{const l=langOf(await getUser(env.DB,ctx.from.id)),id=Number(ctx.match[1]);await ctx.answerCallbackQuery();await ctx.reply(t(l,"confirm_delete",{id}),{reply_markup:new InlineKeyboard().text(t(l,"yes_delete"),`confirm_delete:${id}`).text(t(l,"cancel"),"cancel_delete")});});
  bot.callbackQuery(/^confirm_delete:(\d+)$/,async ctx=>{const l=langOf(await getUser(env.DB,ctx.from.id)),id=Number(ctx.match[1]);const result=await env.DB.prepare("DELETE FROM reminders WHERE id=? AND user_id=? AND is_sent IN (0,2)").bind(id,ctx.from.id).run();if(result.meta.changes!==1){await ctx.answerCallbackQuery(t(l,"not_found"),{show_alert:true});return;}await ctx.answerCallbackQuery(t(l,"deleted"));try{await ctx.deleteMessage();}catch{}await showReminders(ctx,env,l);});
  bot.callbackQuery("cancel_delete",async ctx=>{const l=langOf(await getUser(env.DB,ctx.from.id));await ctx.answerCallbackQuery(t(l,"cancelled"));try{await ctx.deleteMessage();}catch{}});
  bot.hears(["🌐 تغییر زبان","🌐 Change language"],async ctx=>{const l=langOf(await getUser(env.DB,ctx.from.id));await ctx.reply(t(l,"choose_language"),{reply_markup:languageKeyboard()});});
  bot.hears(["راهنما❓","❓ Help"],async ctx=>{const l=langOf(await getUser(env.DB,ctx.from.id));await ctx.reply(t(l,"help_text"),{reply_markup:menu(l)});});
  bot.hears(["تماس📞","📞 Contact"],async ctx=>{const l=langOf(await getUser(env.DB,ctx.from.id));const kb=new InlineKeyboard().url("Telegram","https://t.me/Lowkasra").row().url("LinkedIn","https://www.linkedin.com/in/kasrakarimian/").row().url("GitHub","https://github.com/kasrakr").row().url("Buy Me a Coffee!","https://coffeebede.com/highkasra");await ctx.reply(t(l,"contact_text"),{reply_markup:kb});});
  bot.hears(["یادآوری های من⏱️","⏱️ My Reminders"],async ctx=>{const l=langOf(await getUser(env.DB,ctx.from.id));await showReminders(ctx,env,l);});
  bot.on("message:text",async ctx=>{const text=ctx.message.text;if(text.startsWith("/"))return;const adminPending=await env.DB.prepare("SELECT 1 FROM broadcast_sessions WHERE user_id=?").bind(ctx.from.id).first();if(adminPending&&String(env.ADMINS||"").split(",").map(Number).includes(ctx.from.id)){for(const u of (await env.DB.prepare("SELECT user_id FROM users WHERE is_blocked=0").all()).results||[]){try{await ctx.api.copyMessage(u.user_id,ctx.chat.id,ctx.message.message_id);}catch{}}await env.DB.prepare("DELETE FROM broadcast_sessions WHERE user_id=?").bind(ctx.from.id).run();await ctx.reply("Broadcast is Finished");return;}const u=await getUser(env.DB,ctx.from.id),l=langOf(u);let parsed=regexParser(text,wallNow(env));if(parsed){parsed=[parsed[0],wallToUtc(env,parsed[1])];}else parsed=await parseWithLLM(env,text);if(!parsed){await ctx.reply(t(l,"parse_error"),{reply_markup:menu(l)});return;}const [description,when]=parsed;const result=await env.DB.prepare("INSERT INTO reminders (user_id,chat_id,text,remind_at,created_at,is_sent) VALUES (?,?,?,?,?,0)").bind(ctx.from.id,ctx.chat.id,description,when.toISOString(),new Date().toISOString()).run();try{await ctx.react("❤️‍🔥");}catch{}await ctx.reply(t(l,"scheduled",{description,when:formatWhen(when,env,l)}),{reply_markup:menu(l)});});
  bot.catch(err=>console.error("RemindTel error",err.error));
  botCache.set(key,bot);return bot;
}

export default {
  async fetch(request,env,ctx){
    await ensureSchema(env.DB);
    if(request.method==="GET")return new Response("RemindTel Worker is running",{status:200});
    if(env.WEBHOOK_SECRET&&request.headers.get("X-Telegram-Bot-Api-Secret-Token")!==env.WEBHOOK_SECRET)return new Response("Unauthorized",{status:401});
    const bot=getBot(env);
    return webhookCallback(bot,"cloudflare-mod")(request);
  },
  async scheduled(controller,env,ctx){
    await ensureSchema(env.DB);
    ctx.waitUntil(processDue(env));
  }
};
