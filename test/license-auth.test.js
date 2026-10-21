'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const {EventEmitter}=require('node:events');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createVerifier}=require('../src/session-lease');
const pair=generateKeyPairSync('ed25519');
const publicKey=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
let wall=1800000000000,mono=0;
const pending=[];
const fakeHttps={request(_url,_opts,callback){const req=new EventEmitter();req.end=()=>{queueMicrotask(()=>{const next=pending.shift();if(!next){req.emit('error',Error('No mock reply'));return;}if(next.error){req.emit('error',Error(next.error));return;}if(next.before)next.before();const res=new EventEmitter();res.statusCode=next.status||200;callback(res);res.emit('data',JSON.stringify(next.body));res.emit('end');});};req.destroy=e=>req.emit('error',e);return req;}};
const originalLoad=Module._load;
Module._load=function(name,parent,...rest){
 if(name==='electron')return{safeStorage:{isEncryptionAvailable:()=>false}};
 if(name==='https')return fakeHttps;
 if(name==='./session-lease'&&parent.filename.endsWith('license.js'))return{createVerifier:()=>createVerifier({publicKey,wall:()=>wall,monotonic:()=>mono})};
 return originalLoad.call(this,name,parent,...rest);
};
const license=require('../src/license');Module._load=originalLoad;
function proof(plan='plus'){const b=Buffer.from(JSON.stringify({typ:'woof-session-v1',app:'tweaks',device:'device',sub:7,plan,iat:wall/1000,exp:wall/1000+900})).toString('base64url');return b+'.'+sign(null,Buffer.from(b),pair.privateKey).toString('base64url');}
function store(){const map=new Map();return{get:(k,d)=>map.has(k)?map.get(k):d,set:(k,v)=>map.set(k,v),delete:k=>map.delete(k)};}
test('account refresh verifies a signed plan and cannot unlock from an editable local timestamp',async()=>{
 const s=store();license.init({store:s,deviceId:()=> 'device',osId:()=> 'win32',version:'1.1.7',isPackaged:false});
 try{
  await license.refresh();await license.refresh(); // A signed-out refresh must never leave the promise stuck.
  s.set('session',{raw:'test-token',name:'Tester'});s.set('plan','lifetime');s.set('planCheckedAt',Date.now());
  assert.equal(license.session().signedIn,false);assert.equal(license.cachedPlan(),'free');
  pending.push({body:{signedIn:true,plan:'lifetime',authLease:proof('plus'),name:'Tester'}});
  assert.equal((await license.refresh()).signedIn,true);assert.equal(license.cachedPlan(),'plus');
  pending.push({status:503,body:{signedIn:false}});
  assert.equal((await license.refresh()).signedIn,true);assert.ok(s.get('session'));
  pending.push({error:'offline'});assert.equal((await license.refresh()).signedIn,true);
  wall-=3600000;mono+=900000;
  assert.equal(license.session().signedIn,false);assert.equal(license.cachedPlan(),'free');
 }finally{license.stop();wall=1800000000000;mono=0;}
});
test('browser approval obtains a fresh lease, and revocation immediately removes access',async()=>{
 const s=store();let opened,approved;
 const done=new Promise(resolve=>{approved=resolve;});
 license.init({store:s,deviceId:()=> 'device',osId:()=> 'win32',version:'1.1.7',isPackaged:false,emit:(_ch,d)=>{if(d.status==='approved')approved(d);}});
 try{
  pending.push({body:{ok:true,code:'TEST-CODE',url:'https://woof-services.stream/app/link?code=TEST-CODE',pollToken:'secret-poll',expiresIn:600,interval:2}});
  pending.push({body:{status:'approved',token:'new-app-token',name:'Tester',plan:'plus'}});
  pending.push({body:{signedIn:true,plan:'plus',authLease:proof('plus'),name:'Tester'}});
  await license.startLogin(url=>{opened=url;});
  const result=await done;assert.equal(result.signedIn,true);assert.ok(opened.startsWith('https://woof-services.stream/app/link?code='));
  pending.push({body:{signedIn:false,plan:'free'}});
  assert.equal((await license.refresh()).signedIn,false);assert.equal(s.get('session'),undefined);
 }finally{license.stop();}
});

test('a cancelled in-flight approval cannot sign the app back in',async()=>{
 const s=store();let revoke,approved=false;
 const revoked=new Promise(resolve=>{revoke=resolve;});
 license.init({store:s,deviceId:()=> 'device',osId:()=> 'win32',version:'1.1.7',isPackaged:false,emit:(_ch,d)=>{if(d.status==='approved')approved=true;}});
 try{
  pending.push({body:{ok:true,code:'CANCEL-ME',url:'https://woof-services.stream/app/link?code=CANCEL-ME',pollToken:'cancel-poll',expiresIn:600,interval:2}});
  pending.push({before:()=>license.cancelLogin(),body:{status:'approved',token:'cancelled-token',name:'Cancelled'}});
  pending.push({before:()=>revoke(),body:{ok:true}});
  await license.startLogin(()=>{});await revoked;await Promise.resolve();
  assert.equal(approved,false);assert.equal(license.authenticated(),false);assert.equal(s.get('session'),undefined);
 }finally{license.stop();}
});

test('mandatory update survives refreshed events and offline checks without granting access', async()=>{
 const s=store(),events=[];
 license.init({store:s,deviceId:()=> 'device',osId:()=> 'win32',version:'1.2.1',isPackaged:false,emit:(_ch,d)=>events.push(d)});
 try{
  s.set('session',{raw:'update-token',name:'Tester'});
  pending.push({body:{signedIn:true,plan:'plus',authLease:proof('plus')}});
  assert.equal((await license.refresh()).signedIn,true);
  pending.push({status:426,body:{signedIn:true,updateRequired:true,minimumVersion:'1.2.2'}});
  const blocked=await license.refresh();
  assert.equal(blocked.signedIn,false);assert.equal(blocked.hasAccount,true);
  assert.equal(blocked.updateRequired,true);assert.equal(blocked.minimumVersion,'1.2.2');
  assert.equal(events.at(-1).updateRequired,true);assert.equal(license.entitled(),false);
  pending.push({error:'offline'});assert.equal((await license.refresh()).updateRequired,true);
  pending.push({body:{signedIn:true,plan:'plus',authLease:proof('plus')}});
  assert.equal((await license.refresh()).updateRequired,false);assert.equal(license.entitled(),true);
  pending.push({body:{ok:true}});await license.logout();assert.equal(license.session().updateRequired,false);
 }finally{license.stop();}
});

test('approved browser login reports update recovery without repeated license requests',async()=>{
 const s=store();let ready;
 const done=new Promise(resolve=>{ready=resolve;});
 license.init({store:s,deviceId:()=> 'device',osId:()=> 'win32',version:'1.2.1',isPackaged:false,emit:(_ch,d)=>{if(d.status==='update-required')ready(d);}});
 try{
  pending.push({body:{ok:true,code:'UPDATE-ME',url:'https://woof-services.stream/app/link?code=UPDATE-ME',pollToken:'update-poll',expiresIn:600,interval:2}});
  pending.push({body:{status:'approved',token:'approved-update-token',name:'Tester'}});
  pending.push({status:426,body:{signedIn:true,updateRequired:true,minimumVersion:'1.2.2'}});
  await license.startLogin(()=>{});
  const result=await done;
  assert.equal(result.updateRequired,true);assert.equal(result.hasAccount,true);
  assert.equal(result.signedIn,false);assert.equal(pending.length,0);assert.equal(license.entitled(),false);
 }finally{license.stop();}
});
