export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>pi, durable</title>
<style>
:root{--ink:#18181b;--mute:#71717a;--line:#e4e4e7;--bg:#fafafa;--o:#f6821f;--ok:#15803d;--bad:#b91c1c}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font:15px/1.5 -apple-system,Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg);display:grid;grid-template-columns:1fr 340px;grid-template-rows:auto 1fr auto;height:100vh}
header{grid-column:1/3;display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid var(--line);background:#fff}
header b{font-size:15px}header .sid{font:12px ui-monospace,monospace;color:var(--mute)}
.pill{font:600 11px ui-monospace,monospace;padding:3px 9px;border-radius:999px;background:#f4f4f5;color:var(--mute)}
.pill.on{background:#dcfce7;color:var(--ok)}.pill.off{background:#fee2e2;color:var(--bad)}
header .sp{flex:1}
button{font:inherit;font-size:13px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer}
button:hover{border-color:#a1a1aa}button.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
#log{overflow:auto;padding:24px 28px}
.msg{max-width:760px;margin:0 auto 16px}
.who{font:600 11px ui-monospace,monospace;color:var(--mute);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.user .body{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;display:inline-block}
.think{color:var(--mute);font-size:13px;border-left:2px solid var(--line);padding-left:10px;white-space:pre-wrap;margin:4px 0}
.text{white-space:pre-wrap}
.tool{font:12.5px ui-monospace,monospace;background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:6px 0}
.tool .n{color:var(--o);font-weight:600}.tool .r{color:var(--mute);white-space:pre-wrap;max-height:120px;overflow:auto;margin-top:4px}
form{grid-column:1;display:flex;gap:8px;padding:14px 20px;border-top:1px solid var(--line);background:#fff}
textarea{flex:1;font:inherit;border:1px solid var(--line);border-radius:10px;padding:10px 12px;resize:none;height:46px}
aside{grid-row:2/4;grid-column:2;border-left:1px solid var(--line);background:#fff;overflow:auto;padding:14px 16px;font-size:13px}
aside h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:16px 0 8px}
aside h3:first-child{margin-top:0}
.try button{display:block;width:100%;text-align:left;margin-bottom:6px}
.wire{font:11px ui-monospace,monospace;color:var(--mute);max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-all}
.wire div{border-bottom:1px dashed var(--line);padding:3px 0}
.kv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font:12px ui-monospace,monospace}
.kv span:nth-child(odd){color:var(--mute)}
.note{color:var(--mute);font-size:12px}
@media (max-width:860px){body{grid-template-columns:1fr}aside{display:none}}
</style></head><body>
<header><b>pi, durable</b><span class="pill" id="conn">connecting</span><span class="sid" id="sid"></span><span class="sp"></span>
<button id="drop" title="Close the socket. The agent keeps running in its Durable Object.">Drop connection</button>
<button id="fresh">New session</button></header>
<main id="log"></main>
<form id="f"><textarea id="q" placeholder="Ask something. Try: where are you running, and what time is it there?"></textarea><button class="primary">Send</button><button type="button" id="stop">Stop</button></form>
<aside>
<h3>Try</h3>
<div class="try">
<button data-q="Where are you running right now, and what time is it there?">Where are you running?</button>
<button data-q="Fetch https://www.cloudflare.com/cdn-cgi/trace and https://blog.cloudflare.com/ and tell me one interesting thing about each.">Fetch two pages</button>
<button data-q="Write a 400 word story about a Durable Object that refuses to forget. Take your time.">Long answer (then drop the connection)</button>
</div>
<h3>What this is</h3>
<p class="note">A stock pi extension running inside a Cloudflare Durable Object on pi-durable, with DeepSeek V4.1 Flash on Workers AI. The session lives in the Durable Object's SQLite, not in this tab. Drop the connection or reload mid-answer: the page reconnects and replays from its cursor.</p>
<h3>Session</h3>
<div class="kv"><span>model</span><span>deepseek-v4.1-flash</span><span>tools</span><span id="tools">clock, fetch_page, where_am_i</span><span>frames</span><span id="frames">0</span><span>reconnects</span><span id="recon">0</span><span>tokens</span><span id="tok">0</span></div>
<h3>Wire</h3>
<div class="wire" id="wire"></div>
</aside>
<script>
const $=s=>document.querySelector(s);
let sid=new URLSearchParams(location.search).get('s')||localStorage.getItem('pid-session');
if(!sid){sid=Math.random().toString(36).slice(2,10);}
localStorage.setItem('pid-session',sid);history.replaceState(null,'','?s='+sid);$('#sid').textContent='session '+sid;
let ws,manualDrop=false,frames=0,recon=0,tokens=0;
const live=new Map();
const wire=(t)=>{const d=document.createElement('div');d.textContent=t;$('#wire').prepend(d);while($('#wire').childElementCount>80)$('#wire').lastChild.remove();};
const scroll=()=>{const l=$('#log');l.scrollTop=l.scrollHeight;};
const el=(cls,html)=>{const d=document.createElement('div');d.className=cls;if(html!==undefined)d.innerHTML=html;return d;};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function textOf(content){return (Array.isArray(content)?content:[{type:'text',text:String(content??'')}]).filter(b=>b.type==='text').map(b=>b.text).join('');}
function renderMessage(m,id){
  if(m.role==='user'){const d=el('msg user','<div class="who">you</div><div class="body"></div>');d.querySelector('.body').textContent=textOf(m.content);return d;}
  if(m.role==='assistant'){const d=el('msg asst','<div class="who">pi</div>');for(const b of m.content||[]){
    if(b.type==='thinking'&&b.thinking){const t=el('think');t.textContent=b.thinking;d.append(t);}
    if(b.type==='text'&&b.text){const t=el('text');t.textContent=b.text;d.append(t);}
    if(b.type==='toolCall'){const t=el('tool');t.dataset.call=b.id;t.innerHTML='<span class="n">'+esc(b.name)+'</span> '+esc(JSON.stringify(b.arguments||{}))+'<div class="r">…</div>';d.append(t);}
  }return d;}
  if(m.role==='toolResult'){const t=document.querySelector('[data-call="'+m.toolCallId+'"] .r');if(t){t.textContent=textOf(m.content).slice(0,600);}return null;}
  return null;
}
const order=id=>Number(id)||0;
function placeEntry(d,id){
  d.dataset.entry=id;
  const later=[...$('#log').children].find(c=>c.dataset.entry&&order(c.dataset.entry)>order(id));
  $('#log').insertBefore(d,later||$('#streaming')||null);
}
function addEntry(entry){
  if(document.querySelector('[data-entry="'+entry.id+'"]'))return;
  for(const m of entry.model||[]){
    if(m.role==='toolResult'){renderMessage(m);continue;}
    const d=renderMessage(m);if(d)placeEntry(d,entry.id);
  }
  scroll();
}
function addEntries(entries){
  const sorted=[...entries].sort((a,b)=>order(a.id)-order(b.id));
  for(const en of sorted)if(!(en.model||[]).some(m=>m.role==='toolResult'))addEntry(en);
  for(const en of sorted)if((en.model||[]).some(m=>m.role==='toolResult'))addEntry(en);
}
function streamUpdate(ev){
  let d=$('#streaming');
  if(!d){d=el('msg asst','<div class="who">pi · streaming</div>');d.id='streaming';$('#log').append(d);}
  for(const c of ev.changes||[]){
    if(c.type==='message'){d.remove();return;}
    const key='b'+c.contentIndex;let b=d.querySelector('[data-k="'+key+'"]');
    const kind=c.type.startsWith('thinking')?'think':c.type.startsWith('toolcall')?'tool':'text';
    if(!b){b=el(kind);b.dataset.k=key;d.append(b);}
    if(c.delta!==undefined)b.textContent+=c.delta;
  }
  scroll();
}
function onAgent(ev){
  if(ev.type==='message_update')return streamUpdate(ev);
  if(ev.type==='message_end'&&ev.entry){$('#streaming')?.remove();addEntry(ev.entry);for(const m of ev.entry.model||[]){if(m.usage){tokens+=m.usage.totalTokens||0;$('#tok').textContent=tokens;}}return;}
  if(ev.type==='tool_execution_end'&&ev.entry){addEntry(ev.entry);return;}
  if(ev.type==='entry_appended'&&ev.entry){addEntries([ev.entry]);return;}
  if(ev.type==='run_end'){$('#streaming')?.remove();}
}
function connect(){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(proto+'://'+location.host+'/turn?name='+sid);
  $('#conn').textContent='connecting';$('#conn').className='pill';
  ws.onopen=()=>{$('#conn').textContent='live';$('#conn').className='pill on';};
  ws.onclose=()=>{$('#conn').textContent='dropped';$('#conn').className='pill off';wire('socket closed');if(!manualDrop)setTimeout(()=>{recon++;$('#recon').textContent=recon;connect();},800);};
  ws.onmessage=(e)=>{frames++;$('#frames').textContent=frames;const m=JSON.parse(e.data);
    if(m.type==='history'){wire('history · '+m.entries.length+' entries');$('#streaming')?.remove();addEntries(m.entries);return;}
    if(m.type==='limit'){const d=el('msg asst','<div class="who">demo</div>');d.append(Object.assign(el('text'),{textContent:m.message}));$('#log').append(d);scroll();return;}
    if(m.type==='agent'){wire('agent · '+m.events.map(x=>x.type).join(', '));for(const ev of m.events)onAgent(ev);return;}
    wire(m.type||'frame');
  };
}
$('#f').onsubmit=(e)=>{e.preventDefault();const q=$('#q').value.trim();if(!q||ws.readyState!==1)return;ws.send(JSON.stringify({type:'input',content:q}));$('#q').value='';};
$('#q').onkeydown=(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#f').requestSubmit();}};
$('#stop').onclick=()=>ws.readyState===1&&ws.send(JSON.stringify({type:'abort'}));
$('#drop').onclick=()=>{if(ws.readyState===1){manualDrop=true;ws.close();wire('you dropped the socket; reconnecting in 3 s');setTimeout(()=>{manualDrop=false;recon++;$('#recon').textContent=recon;connect();},3000);}};
$('#fresh').onclick=()=>{localStorage.removeItem('pid-session');location.href=location.pathname;};
document.querySelectorAll('.try button').forEach(b=>b.onclick=()=>{$('#q').value=b.dataset.q;$('#f').requestSubmit();});
connect();
</script></body></html>`;
