import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localCommand } from '../lib/server/local';
const hash='b'.repeat(64);
test('one-time two-seat invite, retry-safe fire, heartbeat and rejoin bounds', () => {
  const a=randomUUID(),b=randomUUID(),c=randomUUID(),time=1000000;
  const r=localCommand(a,'create',null,{lit:true},time);
  localCommand(a,'invite',r.id,{tokenHash:hash},time);
  const joined=localCommand(b,'join',r.id,{tokenHash:hash},time+1); assert.equal(joined.members.length,2); assert.ok(joined.fire.lit);
  assert.throws(()=>localCommand(c,'join',r.id,{tokenHash:hash},time+1),/ROOM_FULL/);
  const requestId=randomUUID(); const fire=localCommand(b,'fire',r.id,{kind:'add',requestId},time+2);
  assert.equal(localCommand(b,'fire',r.id,{kind:'add',requestId},time+3).version,fire.version);
  assert.equal(localCommand(b,'heartbeat',r.id,{},time+89000).members.length,2);
  assert.throws(()=>localCommand(a,'read',r.id,{},time+90001),/SEAT_EXPIRED/);
  const after=localCommand(b,'read',r.id,{},time+90001); assert.equal(after.members.length,1);
  localCommand(b,'invite',r.id,{tokenHash:'c'.repeat(64)},time+90002);
  assert.throws(()=>localCommand(c,'join',r.id,{tokenHash:hash},time+90003),/INVITE_EXPIRED/);
  assert.equal(localCommand(c,'join',r.id,{tokenHash:'c'.repeat(64)},time+90003).members.length,2);
});
test('explicit leave releases the seat and expired invitation cannot be used', () => {
  const a=randomUUID(),b=randomUUID(),r=localCommand(a,'create',null,{},5000000);
  localCommand(a,'invite',r.id,{tokenHash:hash},5000000);
  localCommand(b,'join',r.id,{tokenHash:hash},5000001);
  assert.equal(localCommand(b,'leave',r.id,{},5000002).members.length,1);
  assert.throws(()=>localCommand(b,'join',r.id,{tokenHash:hash},5000003),/INVITE_EXPIRED/);
  assert.throws(()=>localCommand(b,'read',r.id,{},5000004),/SEAT_EXPIRED/);
});
