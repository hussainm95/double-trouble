import test from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createGameServer} from '../server.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=7000){const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out');await wait(20)}}
const join=(s,data)=>new Promise((resolve,reject)=>s.timeout(2000).emit('join',data,(e,r)=>e?reject(e):resolve(r)));
test('real two-client WebSocket room, movement, delivery, capacity, isolation and reconnect',async()=>{
 const game=createGameServer({graceMs:300});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${game.server.address().port}`,clients=[];
 async function client(){const s=io(base,{transports:['websocket'],forceNew:true,reconnection:false});clients.push(s);s.on('state',v=>s.latest=v);await until(()=>s.connected);return s}
 try{
 assert.equal((await fetch(base+'/health')).status,200);assert.match(await (await fetch(base)).text(),/Double Trouble/);
 const a=await client(),b=await client(),c=await client();
 assert.ok((await join(c,{room:'MISSING'})).error);
 const first=await join(a,{mode:'create',name:'أحمد'});assert.match(first.room,/^\d{6}$/);
 const second=await join(b,{room:first.room,name:'حسين'});assert.ok(second.id);
 await until(()=>Object.keys(a.latest?.players||{}).length===2&&Object.keys(b.latest?.players||{}).length===2);
 assert.equal(a.io.engine.transport.name,'websocket');assert.equal(b.io.engine.transport.name,'websocket');
 assert.ok((await join(c,{room:first.room})).error);assert.ok((await join(a,{mode:'create'})).error);
 const third=await join(c,{mode:'create'});assert.notEqual(third.room,first.room);assert.equal(Object.keys(c.latest.players).length,1);
 const start=a.latest.players[first.id].x;for(let i=0;i<1000;i++)a.emit('move',{dx:1,dy:0});await wait(140);assert.ok(a.latest.players[first.id].x-start<45,'input flooding cannot teleport');
 a.emit('move',{dx:NaN,dy:Infinity});
 async function walk(x,y){const timer=setInterval(()=>{const p=a.latest.players[first.id];a.emit('move',{dx:x-p.x,dy:y-p.y})},35);try{await until(()=>Math.hypot(a.latest.players[first.id].x-x,a.latest.players[first.id].y-y)<8,8000)}finally{clearInterval(timer);a.emit('move',{dx:0,dy:0})}}
 await walk(380,275);a.emit('interact');await until(()=>a.latest.players[first.id].holding);
 await walk(760,320);await until(()=>a.latest.delivered===1&&b.latest.delivered===1);assert.equal(b.latest.coins,100);
 assert.equal(c.latest.coins,0);assert.ok(Number.isFinite(a.latest.players[first.id].x));
 const before=a.latest.players[first.id].x;a.disconnect();await until(()=>!b.latest.players[first.id].connected);
 const resumed=await client();const r=await join(resumed,{room:first.room,token:first.token});assert.equal(r.id,first.id);assert.equal(resumed.latest.coins,100);assert.ok(Math.abs(resumed.latest.players[first.id].x-before)<10);
 resumed.disconnect();await wait(400);await until(()=>Object.keys(b.latest.players).length===1);
 const replacement=await client();assert.ok((await join(replacement,{room:first.room})).id);
 b.emit('leave');replacement.emit('leave');await wait(100);assert.ok((await join(b,{room:first.room})).error);
 }finally{for(const s of clients)s.disconnect();await game.close()}
});
test('HTTP long-polling fallback',async()=>{const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const s=io(`http://127.0.0.1:${game.server.address().port}`,{transports:['polling'],reconnection:false});try{await until(()=>s.connected);assert.ok((await join(s,{mode:'create'})).room)}finally{s.disconnect();await game.close()}});
