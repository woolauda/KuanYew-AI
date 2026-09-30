import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const base=import.meta.dirname, publicRoot=resolve(base,'dist'), dataRoot=resolve(base,process.env.KUANYEW_DATA_DIR||'.data');
await mkdir(dataRoot,{recursive:true});
const db=new DatabaseSync(resolve(dataRoot,'community.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS replies (id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER NOT NULL REFERENCES topics(id), nickname TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS replies_topic_id ON replies(topic_id);`);
if(db.prepare('SELECT COUNT(*) AS n FROM topics').get().n===0){const now=new Date().toISOString();db.prepare('INSERT INTO topics (nickname,category,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('KuanYew AI','站务','欢迎来到 KuanYew AI 交流区','这里可以交流 AI 工具使用、作品创作和电商运营经验。发帖时说明你的任务和遇到的问题，会更容易获得有用的回复。',now,now)}

const feeds=[{name:'OpenAI',url:'https://openai.com/news/rss.xml',home:'https://openai.com/news/'},{name:'Google DeepMind',url:'https://deepmind.google/blog/rss.xml',home:'https://deepmind.google/blog/'},{name:'Hugging Face',url:'https://huggingface.co/blog/feed.xml',home:'https://huggingface.co/blog'}];
const fallback=[
  {title:'AI 修复程序错误的智能体如何工作',url:'https://huggingface.co/blog/huggingface/anatomy-of-a-bug-fixing-agent',source:'Hugging Face',publishedAt:'2026-09-29T00:00:00Z',type:'article'},
  {title:'Google DeepMind：让云端 AI 记忆兼顾隐私',url:'https://deepmind.google/blog/advancing-private-ai-compute-with-secure-server-side-memory/',source:'Google DeepMind',publishedAt:'2026-09-23T00:00:00Z',type:'article'},
  {title:'OpenAI 发布面向金融服务的 ChatGPT',url:'https://openai.com/index/introducing-chatgpt-financial-services/',source:'OpenAI',publishedAt:'2026-09-10T00:00:00Z',type:'article'}
];
let newsCache=null,newsCacheUntil=0;
const unescapeXml=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&(?:amp|lt|gt|quot|apos);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[m]).trim();
const xmlValue=(xml,tag)=>{const m=xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));return m?unescapeXml(m[1]):''};
function parseFeed(xml,source){return [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0,12).map(([,type,body])=>{const title=xmlValue(body,'title');const rawLink=xmlValue(body,'link')||body.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]||'';let url;try{url=new URL(rawLink);if(!['https:','http:'].includes(url.protocol))return null}catch{return null}const rawDate=xmlValue(body,'pubDate')||xmlValue(body,'published')||xmlValue(body,'updated'),time=Date.parse(rawDate);return title?{title,url:url.href,source,publishedAt:Number.isFinite(time)?new Date(time).toISOString():null,type:'article'}:null}).filter(Boolean)}
async function getNews(force=false){if(!force&&newsCache&&Date.now()<newsCacheUntil)return newsCache;const groups=await Promise.all(feeds.map(async f=>{try{const response=await fetch(f.url,{headers:{'user-agent':'KuanYewAI/1.0 (+news aggregation)'},signal:AbortSignal.timeout(6500)});if(!response.ok)throw Error(String(response.status));return parseFeed(await response.text(),f.name)}catch{return []}}));const items=groups.flat().sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,9);newsCache={items:items.length?items:fallback,updatedAt:items.length?new Date().toISOString():'2026-09-30T00:00:00Z',stale:!items.length};newsCacheUntil=Date.now()+(items.length?30:5)*60_000;return newsCache}

const limits=new Map();
function rateLimit(ip,kind,max){const key=`${ip}:${kind}`,now=Date.now(),hits=(limits.get(key)||[]).filter(t=>now-t<3_600_000);if(hits.length>=max)return false;hits.push(now);limits.set(key,hits);return true}
const categories=new Set(['提问求助','工具体验','作品展示','电商运营']);
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))};
async function bodyJson(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>10_000)throw Error('内容太长');chunks.push(chunk)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
function originAllowed(req){const origin=req.headers.origin;if(!origin)return true;try{const u=new URL(origin);return u.host===req.headers.host&&['http:','https:'].includes(u.protocol)}catch{return false}}
const topicList=db.prepare(`SELECT t.id,t.nickname,t.category,t.title,t.created_at,t.updated_at,(SELECT COUNT(*) FROM replies r WHERE r.topic_id=t.id) AS reply_count FROM topics t ORDER BY t.updated_at DESC LIMIT 100`);
const topicCategory=db.prepare(`SELECT t.id,t.nickname,t.category,t.title,t.created_at,t.updated_at,(SELECT COUNT(*) FROM replies r WHERE r.topic_id=t.id) AS reply_count FROM topics t WHERE t.category=? ORDER BY t.updated_at DESC LIMIT 100`);
const topicOne=db.prepare('SELECT id,nickname,category,title,body,created_at,updated_at FROM topics WHERE id=?');
const replyList=db.prepare('SELECT id,nickname,body,created_at FROM replies WHERE topic_id=? ORDER BY id ASC LIMIT 300');
const addTopic=db.prepare('INSERT INTO topics (nickname,category,title,body,created_at,updated_at) VALUES (?,?,?,?,?,?)');
const addReply=db.prepare('INSERT INTO replies (topic_id,nickname,body,created_at) VALUES (?,?,?,?)');
const touchTopic=db.prepare('UPDATE topics SET updated_at=? WHERE id=?');

async function handleApi(req,res,url){
  if(url.pathname==='/api/news'&&req.method==='GET')return send(res,200,await getNews(url.searchParams.get('refresh')==='1'));
  if(url.pathname==='/api/topics'&&req.method==='GET'){const category=url.searchParams.get('category')||'全部';if(category!=='全部'&&!categories.has(category))return send(res,400,{error:'分类无效'});return send(res,200,{items:category==='全部'?topicList.all():topicCategory.all(category)})}
  const topicMatch=url.pathname.match(/^\/api\/topics\/(\d+)$/);if(topicMatch&&req.method==='GET'){const id=Number(topicMatch[1]),topic=topicOne.get(id);return topic?send(res,200,{topic,replies:replyList.all(id)}):send(res,404,{error:'话题不存在'})}
  if(!originAllowed(req))return send(res,403,{error:'请求来源无效'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'请求格式无效'});
  let body;try{body=await bodyJson(req)}catch{return send(res,400,{error:'内容格式有误或过长'})}
  if(body.website)return send(res,400,{error:'提交失败'});
  const ip=req.socket.remoteAddress||'unknown',nickname=clean(body.nickname,24),content=clean(body.body,3000);
  if(nickname.length<2||nickname.length>24)return send(res,400,{error:'昵称请输入 2–24 个字'});
  if(nickname.toLocaleLowerCase()==='kuanyew ai')return send(res,400,{error:'请使用其他昵称'});
  if(url.pathname==='/api/topics'&&req.method==='POST'){const title=clean(body.title,100),category=body.category;if(!categories.has(category))return send(res,400,{error:'请选择正确分类'});if(title.length<5||title.length>100)return send(res,400,{error:'标题请输入 5–100 个字'});if(content.length<10||content.length>3000)return send(res,400,{error:'内容请输入 10–3000 个字'});if(!rateLimit(ip,'topic',5))return send(res,429,{error:'发帖太频繁，请稍后再试'});const now=new Date().toISOString(),result=addTopic.run(nickname,category,title,content,now,now);return send(res,201,{id:Number(result.lastInsertRowid)})}
  const replyMatch=url.pathname.match(/^\/api\/topics\/(\d+)\/replies$/);if(replyMatch&&req.method==='POST'){const id=Number(replyMatch[1]);if(!topicOne.get(id))return send(res,404,{error:'话题不存在'});if(content.length<2||content.length>1500)return send(res,400,{error:'回复请输入 2–1500 个字'});if(!rateLimit(ip,'reply',20))return send(res,429,{error:'回复太频繁，请稍后再试'});const now=new Date().toISOString(),result=addReply.run(id,nickname,content,now);touchTopic.run(now,id);return send(res,201,{id:Number(result.lastInsertRowid)})}
  return send(res,404,{error:'接口不存在'})
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png'};
const port=Number(process.env.KUANYEW_PORT)||4173;
createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return await handleApi(req,res,url);if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'方法不支持'});const target=resolve(publicRoot,decodeURIComponent(url.pathname==='/'?'index.html':url.pathname.replace(/^\/+/,'')));if(target!==publicRoot&&!target.startsWith(publicRoot+sep))return send(res,403,{error:'路径无效'});try{const bytes=await readFile(target);res.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes)}catch{send(res,404,{error:'页面不存在'})}}catch(e){console.error(e);if(!res.headersSent)send(res,500,{error:'服务暂时不可用'})}}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}/`));
