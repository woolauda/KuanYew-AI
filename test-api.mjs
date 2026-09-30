import assert from 'node:assert/strict';
const base='http://127.0.0.1:4174';
async function json(path,options={}){const r=await fetch(base+path,{...options,headers:{'content-type':'application/json'}});return {status:r.status,data:await r.json()}}
let r=await json('/api/topics');assert.equal(r.status,200);assert.ok(r.data.items.some(x=>x.title.includes('欢迎来到')));
r=await json('/api/topics',{method:'POST',body:JSON.stringify({nickname:'测试用户',category:'电商运营',title:'如何使用 Accio Work 选品？',body:'想比较几个产品方向，应该从哪里开始？',website:''})});assert.equal(r.status,201);const id=r.data.id;
r=await json(`/api/topics/${id}`);assert.equal(r.data.topic.title,'如何使用 Accio Work 选品？');assert.equal(r.data.replies.length,0);
r=await json(`/api/topics/${id}/replies`,{method:'POST',body:JSON.stringify({nickname:'另一位用户',body:'先列出目标市场和预算。',website:''})});assert.equal(r.status,201);
r=await json(`/api/topics/${id}`);assert.equal(r.data.replies.length,1);
r=await json('/api/topics?category=电商运营');assert.ok(r.data.items.some(x=>x.id===id&&x.reply_count===1));
r=await json('/api/topics',{method:'POST',body:JSON.stringify({nickname:'x',category:'乱写',title:'错',body:'短',website:''})});assert.equal(r.status,400);
console.log('Topic creation, reply, filtering, and validation passed.');
