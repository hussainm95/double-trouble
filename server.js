import express from 'express';
import {createServer} from 'node:http';
import {randomBytes, randomInt} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Server} from 'socket.io';

export function createGameServer({graceMs=60000}={}) {
 const app=express(),server=createServer(app);
 const io=new Server(server,{maxHttpBufferSize:4096});
 const rooms=new Map();
 app.disable('x-powered-by');
 app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');next()});
 app.get('/health',(_req,res)=>res.json({ok:true}));
 app.use(express.static(fileURLToPath(new URL('./public/',import.meta.url))));
 const freshBox=()=>({x:380,y:255});
 const snap=r=>({players:Object.fromEntries([...r.players].map(([id,p])=>[id,{x:p.x,y:p.y,name:p.name,color:p.color,holding:p.holding,connected:!!p.socketId}])),box:r.box,van:r.van,coins:r.coins,delivered:r.delivered});
 const broadcast=(code,r)=>io.to(code).emit('state',snap(r));
 const locate=s=>{const r=rooms.get(s.data.room);return [r,r?.players.get(s.data.player)]};
 function detach(s,remove=false){const [r,p]=locate(s);if(!p||p.socketId!==s.id)return;p.socketId=null;p.holding=false;p.dx=p.dy=0;p.expires=Date.now()+graceMs;if(remove)r.players.delete(s.data.player);s.leave(s.data.room);broadcast(s.data.room,r);s.data.room=null;s.data.player=null;}
 io.on('connection',s=>{
  let attempts=0,windowStart=Date.now(),lastAction=0;
  s.on('join',(data,ack)=>{
   if(typeof ack!=='function')return;
   if(!data||typeof data!=='object')return ack({error:'طلب غير صالح'});
   if(Date.now()-windowStart>60000){attempts=0;windowStart=Date.now()}
   if(++attempts>20)return ack({error:'محاولات كثيرة؛ انتظر دقيقة'});
   if(s.data.room)return ack({error:'أنت داخل غرفة بالفعل'});
   let code=String(data.room||'').trim().toUpperCase(),r;
   if(data.mode==='create'){
    if(rooms.size>=500)return ack({error:'الخادم مشغول، حاول لاحقاً'});
    do{code=String(randomInt(100000,1000000))}while(rooms.has(code));
    r={players:new Map(),box:freshBox(),van:{x:760,y:300},coins:0,delivered:0};rooms.set(code,r);
   }else{
    if(!/^[A-Z0-9]{4,8}$/.test(code))return ack({error:'أدخل رمز الغرفة الصحيح'});
    r=rooms.get(code);if(!r)return ack({error:'الغرفة غير موجودة أو انتهت؛ أنشئ غرفة جديدة'});
   }
   let id,p;
   if(typeof data.token==='string')for(const [pid,q]of r.players)if(q.token===data.token){id=pid;p=q;break}
   if(p?.socketId)return ack({error:'هذه الجلسة مفتوحة بالفعل'});
   if(!p){
    if(r.players.size>=2)return ack({error:'الغرفة ممتلئة؛ مقعد المنقطع محفوظ لمدة دقيقة'});
    id=randomBytes(12).toString('hex');const slot=[...r.players.values()].some(q=>q.slot===0)?1:0;
    p={x:180+slot*60,y:240,slot,name:String(data.name||`لاعب ${slot+1}`).replace(/[\u0000-\u001f]/g,'').slice(0,18),color:slot?'#ffae58':'#69d7ef',holding:false,token:randomBytes(24).toString('hex')};r.players.set(id,p);
   }
   Object.assign(p,{socketId:s.id,dx:0,dy:0,lastInput:0,expires:0});s.data.room=code;s.data.player=id;s.join(code);ack({id,room:code,token:p.token});broadcast(code,r);
  });
  s.on('move',data=>{const [,p]=locate(s);if(!p||!data)return;let {dx,dy}=data;if(!Number.isFinite(dx)||!Number.isFinite(dy))return;const n=Math.max(1,Math.hypot(dx,dy));p.dx=dx/n;p.dy=dy/n;p.lastInput=Date.now()});
  s.on('interact',()=>{if(Date.now()-lastAction<180)return;lastAction=Date.now();const [r,p]=locate(s);if(!p)return;
   if(p.holding)p.holding=false;else if(Math.hypot(p.x-r.box.x,p.y-r.box.y)<85)p.holding=true;
   broadcast(s.data.room,r);
  });
  s.on('leave',()=>detach(s,true));s.on('disconnect',()=>detach(s));
 });
 let previous=Date.now();
 const timer=setInterval(()=>{
  const now=Date.now(),dt=Math.min((now-previous)/1000,.08);previous=now;
  for(const [code,r]of rooms){
   for(const [id,p]of r.players){if(!p.socketId&&p.expires<=now){r.players.delete(id);continue}if(!p.socketId||now-p.lastInput>250)continue;p.x=Math.max(28,Math.min(930,p.x+p.dx*150*dt));p.y=Math.max(45,Math.min(540,p.y+p.dy*150*dt))}
   if(!r.players.size){rooms.delete(code);continue}
   const holders=[...r.players.values()].filter(p=>p.holding&&p.socketId);
   if(holders.length){r.box.x=holders.reduce((a,p)=>a+p.x,0)/holders.length;r.box.y=holders.reduce((a,p)=>a+p.y,0)/holders.length-20;
    if(Math.hypot(r.box.x-r.van.x,r.box.y-r.van.y)<70){r.coins+=100;r.delivered++;for(const p of r.players.values())p.holding=false;r.box=freshBox();io.to(code).emit('success','وصلتوا الصندوق! +100 عملة 🎉')}
   }
   broadcast(code,r);
  }
 },1000/30);
 return {app,server,io,close:()=>new Promise(resolve=>{clearInterval(timer);io.close(()=>server.close(()=>resolve()))})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const game=createGameServer();game.server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Double Trouble ready'));
 process.on('SIGTERM',async()=>{await game.close();process.exit(0)});
}
