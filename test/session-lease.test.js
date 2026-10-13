'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { createVerifier } = require('../src/session-lease');
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
const encode = claims => { const b = Buffer.from(JSON.stringify(claims)).toString('base64url'); return b+'.'+sign(null,Buffer.from(b),keys.privateKey).toString('base64url'); };
function fixture(){let wall=1800000000000,mono=0;const verifier=createVerifier({publicKey,wall:()=>wall,monotonic:()=>mono});const claims={typ:'woof-session-v1',app:'tweaks',device:'test-device',sub:12,plan:'ultra',iat:wall/1000,exp:wall/1000+900};return{verifier,claims,tick:(ms)=>{wall+=ms;mono+=ms;},clock:(ms)=>{wall+=ms;}};}
test('only a signed, device-bound verified account unlocks a session',()=>{const f=fixture();assert.equal(f.verifier.claims(),null);assert.equal(f.verifier.accept(encode(f.claims),'tweaks','test-device'),true);assert.equal(f.verifier.claims().plan,'ultra');assert.equal(f.verifier.remaining(),900000);});
test('offline session ends at 15 minutes',()=>{const f=fixture();f.verifier.accept(encode(f.claims),'tweaks','test-device');f.tick(899999);assert.ok(f.verifier.claims());f.tick(1);assert.equal(f.verifier.claims(),null);});
test('rolling the system clock back cannot extend the monotonic expiry',()=>{const f=fixture();f.verifier.accept(encode(f.claims),'tweaks','test-device');f.clock(-3600000);f.tick(900000);assert.equal(f.verifier.claims(),null);});
test('reopening the app requires a new online verification',()=>{const f=fixture();f.verifier.accept(encode(f.claims),'tweaks','test-device');assert.equal(createVerifier({publicKey}).claims(),null);});
test('wrong product, device, duration, type, account or future issue time is rejected',()=>{for(const patch of [{app:'macro'},{device:'other'},{exp:1800000901},{typ:'woof-ea-1'},{sub:0},{iat:1800000031,exp:1800000931}]){const f=fixture();assert.equal(f.verifier.accept(encode({...f.claims,...patch}),'tweaks','test-device'),false);}});
test('unsigned edits and a forged plan are rejected',()=>{const f=fixture();const good=encode(f.claims);const forged=Buffer.from(JSON.stringify({...f.claims,plan:'lifetime'})).toString('base64url')+'.'+good.split('.')[1];assert.equal(f.verifier.accept(forged,'tweaks','test-device'),false);assert.equal(f.verifier.accept(good+'.extra','tweaks','test-device'),false);});
test('logout immediately clears offline access',()=>{const f=fixture();f.verifier.accept(encode(f.claims),'tweaks','test-device');f.verifier.clear();assert.equal(f.verifier.claims(),null);});
