import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GuestAccessError,guestAccessError} from '../lib/auth-errors';
test('disabled anonymous provider preserves its actionable code without exposing raw credentials',()=>{
 const error=guestAccessError({code:'anonymous_provider_disabled',status:422,message:'raw upstream response with a private token'});
 assert.equal(error.code,'anonymous_provider_disabled');assert.equal(error.status,422);assert.match(error.message,/게스트 입장이 꺼져/);assert.doesNotMatch(error.message,/token|upstream/);
});
test('network, CAPTCHA, rate limit and rejected keys have distinct public messages',()=>{
 assert.match(guestAccessError({code:'captcha_failed'}).message,/입장 확인/);
 assert.match(guestAccessError({code:'over_anonymous_users_rate_limit'}).message,/많이 시도/);
 assert.match(guestAccessError({status:401}).message,/연결 설정/);
 assert.equal(guestAccessError(new TypeError('Failed to fetch')).code,'guest_auth_network');
 const original=new GuestAccessError('guest_service_unavailable','혼자 캠핑할 수 있어요.',503);assert.equal(guestAccessError(original),original);
});
