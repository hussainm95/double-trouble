const $=s=>document.querySelector(s);
const socket=io({autoConnect:true}),canvas=$('#canvas'),ctx=canvas.getContext('2d');
let myId=null,session=null,busy=false,state={players:{},box:{x:380,y:255},van:{x:760,y:300},coins:0,delivered:0},pressed=new Set(),noticeTimer;
try{session=JSON.parse(sessionStorage.getItem('dt-session')||'null');$('#name').value=localStorage.getItem('dt-name')||''}catch{}
$('#room').value=new URL(location.href).searchParams.get('room')||session?.room||'';
function notice(msg){$('#notice').textContent=msg;$('#notice').style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').style.display='none',2500)}
function status(msg){$('#connection').textContent=msg}
function setBusy(v){busy=v;$('#join').disabled=$('#create').disabled=v}
function enter(mode,resume=false){
 if(busy)return;if(!socket.connected){$('#err').textContent='الاتصال بالخادم جارٍ، انتظر قليلاً';return}
 setBusy(true);const room=resume?session.room:$('#room').value.trim().toUpperCase();
 socket.timeout(8000).emit('join',{mode,room,name:$('#name').value,token:resume?session.token:undefined},(err,res)=>{
  setBusy(false);if(err||res?.error){$('#err').textContent=err?'لم يرد الخادم؛ حاول مرة ثانية':res.error;if(resume){session=null;myId=null;try{sessionStorage.removeItem('dt-session')}catch{}$('#lobby').style.display='grid';$('#game').style.display='none'}return}
  myId=res.id;session={room:res.room,token:res.token};try{sessionStorage.setItem('dt-session',JSON.stringify(session));localStorage.setItem('dt-name',$('#name').value)}catch{}
  $('#room').value=res.room;$('#lobby').style.display='none';$('#game').style.display='block';status('متصل • أرسل رمز الغرفة لصديقك');
 });
}
$('#join').onclick=()=>enter('join');$('#create').onclick=()=>enter('create');
socket.on('connect',()=>{status('متصل');if(session)enter('join',true)});
socket.on('disconnect',()=>{pressed.clear();status('انقطع الاتصال… نحاول الرجوع تلقائياً');setBusy(false)});
socket.on('connect_error',()=>{status('تعذر الاتصال بالخادم');$('#err').textContent='تعذر الاتصال؛ تحقق من الإنترنت أو انتظر تشغيل الخادم'});
socket.on('state',s=>{state=s;const active=Object.values(s.players).filter(p=>p.connected).length;$('#hud').textContent=`الغرفة ${session?.room||''} | 🪙 ${s.coins} | 📦 ${s.delivered} | 👥 ${active}/2`;if(socket.connected)status(active===2?'شريكك وصل • تعاونوا لتوصيل الصندوق':'بانتظار شريكك • تقدر تتحرك وتتدرّب')});
socket.on('success',notice);
$('#share').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',session.room);try{await navigator.clipboard.writeText(url.href);notice('تم نسخ رابط الغرفة')}catch{notice('رمز الغرفة: '+session.room)}};
$('#exit').onclick=()=>{socket.emit('leave');session=null;myId=null;pressed.clear();try{sessionStorage.removeItem('dt-session')}catch{}$('#game').style.display='none';$('#lobby').style.display='grid';$('#err').textContent='خرجت من الغرفة'};
for(const btn of document.querySelectorAll('[data-dir]')){const key=btn.dataset.dir;btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);pressed.add(key)});for(const evt of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(evt,()=>pressed.delete(key))}
$('#act').onclick=()=>{if(myId&&socket.connected)socket.emit('interact')};
const keys={ArrowUp:'0,-1',ArrowDown:'0,1',ArrowLeft:'-1,0',ArrowRight:'1,0',w:'0,-1',s:'0,1',a:'-1,0',d:'1,0'};
window.addEventListener('keydown',e=>{if(!myId)return;if(keys[e.key]||e.key===' ')e.preventDefault();if(keys[e.key])pressed.add(keys[e.key]);if(e.key===' '&&!e.repeat)socket.emit('interact')});window.addEventListener('keyup',e=>{if(keys[e.key])pressed.delete(keys[e.key])});
function stop(){pressed.clear();if(myId&&socket.connected)socket.emit('move',{dx:0,dy:0})}
window.addEventListener('blur',stop);window.addEventListener('orientationchange',stop);document.addEventListener('visibilitychange',stop);
setInterval(()=>{if(!myId||!socket.connected)return;let dx=0,dy=0;if(!document.hidden&&!matchMedia('(orientation:portrait)').matches)for(const k of pressed){const [x,y]=k.split(',').map(Number);dx+=x;dy+=y}
 // Convert screen directions into the isometric world's axes.
 socket.emit('move',{dx:dx/.64+dy/.31,dy:-dx/.64+dy/.31});},50);
function iso(x,y){return [(x-y)*.64,(x+y)*.31]}function tile(x,y,w,h,c){const p=iso(x,y),a=iso(x+w,y),b=iso(x+w,y+h),d=iso(x,y+h);ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...a);ctx.lineTo(...b);ctx.lineTo(...d);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffffff16';ctx.stroke()}
function draw(){if(!canvas.clientWidth){requestAnimationFrame(draw);return}const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=w*dpr;canvas.height=h*dpr}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#bfe9f0';ctx.fillRect(0,0,w,h);ctx.save();const scale=Math.min((w-32)/1000,(h-105)/510);ctx.translate(w/2,h/2+12);ctx.scale(scale,scale);ctx.translate(-131,-240);tile(0,0,980,570,'#8cc98c');tile(80,310,850,125,'#6d8290');tile(340,0,120,570,'#6d8290');for(let i=0;i<5;i++){tile(40+i*175,35,120,125,['#f3b6a2','#e5c17e','#a2c9ed'][i%3]);tile(60+i*175,55,75,65,'#f6eee0')}tile(700,220,145,90,'#e4b456');ctx.textAlign='left';ctx.font='60px system-ui';let v=iso(state.van.x,state.van.y);ctx.fillText('🚚',v[0]-30,v[1]);const b=iso(state.box.x,state.box.y);ctx.font='40px system-ui';ctx.fillText('📦',b[0]-20,b[1]);const players=Object.entries(state.players).sort((a,b)=>(a[1].x+a[1].y)-(b[1].x+b[1].y));for(const [id,p] of players){const [px,py]=iso(p.x,p.y);ctx.fillStyle='#17263c44';ctx.beginPath();ctx.ellipse(px,py+4,21,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(px,py-20,16,0,Math.PI*2);ctx.fill();ctx.font='24px system-ui';ctx.textAlign='center';ctx.fillText(p.holding?'🙌':'🙂',px,py-14);ctx.font='bold 13px system-ui';ctx.fillStyle='#152437';ctx.fillText((id===myId?'⭐ ':'')+p.name+(p.connected?'':' (منقطع)'),px,py-48)}ctx.restore();requestAnimationFrame(draw)}requestAnimationFrame(draw);
