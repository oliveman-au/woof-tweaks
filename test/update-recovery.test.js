'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const renderer = path.join(__dirname, '../src/renderer/js');
const source = fs.readFileSync(path.join(renderer, 'update-recovery.js'), 'utf8');
const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context = vm.createContext({esc});
vm.runInContext(source.replace(/^import .*;$/m, '').replace('export function', 'function') + '\nthis.updateRecovery = updateRecovery;', context);
const {updateRecovery} = context;

test('required update recovery works before sign-in and retains safe backup access', () => {
  assert.equal(updateRecovery({signedIn:false}, {status:'error'}), '');
  const html = updateRecovery({signedIn:false,hasAccount:true,updateRequired:true,minimumVersion:'1.2.2'}, {status:'error',error:'<script>bad</script>'});
  assert.match(html, /Retry update/); assert.match(html, /Get latest installer/);
  assert.match(html, /data-go="backups"/); assert.match(html, /1.2.2/);
  assert.ok(!html.includes('<script>')); assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('Continue in browser'));
});
test('progress, manual download, and ready restart accurately reflect updater state', () => {
  const session = {updateRequired:true};
  assert.match(updateRecovery(session,{status:'downloading',progress:42.4}), /value="42"/);
  assert.match(updateRecovery(session,{status:'downloading',progress:120}), /value="100"/);
  assert.ok(!updateRecovery(session,{status:'downloading'}).includes('data-action="update-check"'));
  assert.match(updateRecovery(session,{status:'ready'}), /data-action="update-install"/);
  assert.match(updateRecovery(session,{status:'available',manual:true}), /data-action="update-download"/);
  assert.match(updateRecovery({}, {critical:true,status:'error'}), /Update to continue/);
});
test('actual app render shows recovery ahead of sign-in/plans while allowing backup restoration', () => {
  const app = fs.readFileSync(path.join(renderer, 'app.js'), 'utf8');
  const body = app.slice(app.indexOf('export function render()'), app.indexOf('// ---------- toasts & modals'));
  const main = {innerHTML:''};
  const state = {page:'dashboard',session:{updateRequired:true,signedIn:false},app:{update:{status:'error'}}};
  const c = vm.createContext({S:state,document:{getElementById:()=>main},PAGES:{dashboard:{render:()=>{throw Error('Must be gated');}},backups:{render:()=>'<backup-ui>'}},updateRecovery,plan:()=> 'free'});
  vm.runInContext(body.replace('export function','function')+'\nrender();', c);
  assert.match(main.innerHTML,/Retry update/);
  state.page='backups'; vm.runInContext('render()',c); assert.equal(main.innerHTML,'<backup-ui>');
});
