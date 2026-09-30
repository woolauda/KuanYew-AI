const newsGrid=document.querySelector('#news-grid');
const newsStatus=document.querySelector('#news-status');
const sourceLinks=[
  {title:'AI 修复程序错误的智能体如何工作',url:'https://huggingface.co/blog/huggingface/anatomy-of-a-bug-fixing-agent',source:'Hugging Face',publishedAt:'2026-09-29T00:00:00Z'},
  {title:'Google DeepMind：让云端 AI 记忆兼顾隐私',url:'https://deepmind.google/blog/advancing-private-ai-compute-with-secure-server-side-memory/',source:'Google DeepMind',publishedAt:'2026-09-23T00:00:00Z'},
  {title:'OpenAI 发布面向金融服务的 ChatGPT',url:'https://openai.com/index/introducing-chatgpt-financial-services/',source:'OpenAI',publishedAt:'2026-09-10T00:00:00Z'}
];
function showNews(items){newsGrid.replaceChildren(...items.map(item=>{const a=document.createElement('a');a.className='news-card';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';const source=document.createElement('span');source.className='news-source';source.textContent=item.source;const title=document.createElement('h3');title.textContent=item.title;const foot=document.createElement('p');foot.textContent=item.publishedAt?new Date(item.publishedAt).toLocaleDateString('zh-CN',{year:'numeric',month:'short',day:'numeric'}):'查看原始来源 ↗';a.append(source,title,foot);return a}))}
async function loadNews(force=false){newsStatus.textContent='正在读取最新内容…';try{const response=await fetch(`/api/news${force?'?refresh=1':''}`);if(!response.ok)throw Error('读取失败');const data=await response.json();showNews(data.items);newsStatus.textContent=data.stale?'实时资讯暂不可用 · 显示 2026 年 9 月 30 日核对的文章':`已更新 · ${new Date(data.updatedAt).toLocaleString('zh-CN')}`}catch{showNews(sourceLinks);newsStatus.textContent='实时资讯暂不可用 · 显示 2026 年 9 月 30 日核对的文章'}}
document.querySelector('#refresh-news').addEventListener('click',()=>loadNews(true));loadNews();
