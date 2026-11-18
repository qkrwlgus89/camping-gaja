import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolutionPolicy,initialResolution,adaptResolution} from '../lib/graphics';
test('automatic resolution keeps at least one rendered pixel per CSS pixel',()=>{
 for(const mobile of [false,true])for(const native of [1,2,3]){const p=resolutionPolicy('auto',mobile,native);assert.ok(p.initial>=1);assert.ok(p.max>=p.min);assert.equal(p.min,1);assert.ok(p.max<=(mobile?1.5:1.75));}
});
test('loading and brief slow frames do not lower resolution; sustained load has a floor and recovers',()=>{
 const p=resolutionPolicy('auto',false,2),original=initialResolution(p,0);let s=original;
 for(let at=2000;at<=10000;at+=2000)s=adaptResolution(s,p,2,at);assert.equal(s.dpr,p.initial);
 s=adaptResolution(s,p,15,12000);s=adaptResolution(s,p,60,14000);assert.equal(s.dpr,p.initial);
 for(let at=16000;at<=120000;at+=2000){s=adaptResolution(s,p,12,at);assert.ok(s.dpr>=1);}
 assert.equal(s.dpr,1);for(let at=122000;at<=210000;at+=2000)s=adaptResolution(s,p,60,at);assert.equal(s.dpr,p.max);assert.equal(original.dpr,p.initial);
});
test('sharp mode holds its resolution even under load, and reduced mode is an explicit choice',()=>{
 const p=resolutionPolicy('sharp',false,2);let s=initialResolution(p,0);for(let at=2000;at<=60000;at+=2000)s=adaptResolution(s,p,5,at);assert.equal(s.dpr,2);assert.ok(resolutionPolicy('sharp',true,3).initial<=1.75);assert.ok(resolutionPolicy('light',true,2).initial<1);
});
