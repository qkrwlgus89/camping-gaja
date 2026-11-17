import { test } from 'node:test';
import assert from 'node:assert/strict';
import SunCalc from 'suncalc';
import { CAMP, daylight, gridFor, kstTime, precipitation, safeWeather, sampleWeather } from '../lib/environment';
import { fireIntensity, validMotion, walkable, zoneAt } from '../lib/world';
import { INITIAL_MOTION } from '../lib/types';
import { kmaBase, normalizeKma } from '../lib/server/weather';
test('KST is independent of OS zone, including the date boundary', () => {
  assert.equal(kstTime(Date.parse('2026-06-21T14:59:00Z')), '23:59');
  assert.equal(kstTime(Date.parse('2026-06-21T15:00:00Z')), '00:00');
  const old = process.env.TZ; process.env.TZ = 'America/Los_Angeles';
  assert.equal(kstTime(Date.parse('2026-06-21T15:00:00Z')), '00:00'); process.env.TZ = old;
});
test('same UTC epoch gives seasonal solar light, east-positive direction, and night outlines', () => {
  const summer = daylight(Date.parse('2026-06-21T18:00:00+09:00'));
  const winter = daylight(Date.parse('2026-12-21T18:00:00+09:00'));
  assert.ok(summer.light > winter.light); assert.ok(winter.altitude < 0);
  assert.ok(daylight(Date.parse('2026-06-21T05:10:00+09:00')).direction[0] > 0);
  assert.equal(daylight(Date.parse('2026-06-21T23:59:00+09:00')).phase, '밤');
  const times = SunCalc.getTimes(new Date('2026-06-21T03:00:00Z'), CAMP.latitude, CAMP.longitude);
  assert.ok(times.sunset.getTime() > Date.parse('2026-06-21T19:30:00+09:00'));
});
test('SunCalc agrees within two minutes with KASI official Seoul seasonal control samples', () => {
  // https://astro.kasi.re.kr/life/pageView/7?mm=06&yyyy=2026 (21st: 05:11 / 19:57)
  // https://astro.kasi.re.kr/life/pageView/7?mm=12&yyyy=2026 (21st: 07:43 / 17:17)
  for (const [date,rise,set] of [['2026-06-21','05:11','19:57'],['2026-12-21','07:43','17:17']]) {
    const times=SunCalc.getTimes(new Date(date+'T03:00:00Z'),37.5665,126.978);
    assert.ok(Math.abs(times.sunrise.getTime()-Date.parse(`${date}T${rise}:00+09:00`))<120000);
    assert.ok(Math.abs(times.sunset.getTime()-Date.parse(`${date}T${set}:00+09:00`))<120000);
  }
});
test('KMA precipitation codes include drizzle, sleet and snow flurries', () => {
  for (const v of [1,4,5]) assert.equal(precipitation(v),'rain');
  for (const v of [2,6]) assert.equal(precipitation(v),'sleet');
  for (const v of [3,7]) assert.equal(precipitation(v),'snow');
  assert.equal(precipitation(0,4),'cloudy'); assert.equal(precipitation(0,1),'clear');
});
test('two hour weather limit retains fresh readings and resets expired weather', () => {
  const w=sampleWeather('rain', 10000000);
  assert.equal(safeWeather(w, 10000000+7199999).kind, 'rain');
  assert.equal(safeWeather(w, 10000000+7200001).stale, true);
  assert.equal(safeWeather(w, 10000000+7200001).source, 'unavailable');
  assert.equal(safeWeather(null).stale, true);
});
test('KMA grid transform matches Seoul reference and fixes the camp grid', () => {
  assert.deepEqual(gridFor(37.5665,126.978), {nx:60,ny:127});
  const grid=gridFor(CAMP.latitude,CAMP.longitude); assert.ok(grid.nx>70 && grid.nx<90); assert.ok(grid.ny>130);
});
test('KMA delayed publication falls across the KST date boundary', () => {
  assert.deepEqual(kmaBase(Date.parse('2026-06-22T00:10:00+09:00')), {base_date:'20260621',base_time:'2300'});
  const rows=['PTY','T1H','RN1'].map((category,i)=>({category,obsrValue:['6','1','0.5'][i],baseDate:'20260621',baseTime:'2300'}));
  const w=normalizeKma(rows,4,Date.parse('2026-06-22T00:00:00+09:00')); assert.equal(w.kind,'sleet'); assert.equal(kstTime(w.observedAt),'23:00');
  assert.throws(()=>normalizeKma([],1,Date.now()));
});
test('untrusted movement is bounded, sequenced and zone checked', () => {
  const m={...INITIAL_MOTION,userId:'a',seq:1,sentAt:1}; assert.ok(validMotion(m));
  assert.ok(!validMotion({...m,x:Infinity})); assert.ok(!validMotion({...m,z:-9}));
  assert.ok(!validMotion({...m,zone:'creek'})); assert.ok(!validMotion({...m,seq:-1}));
  assert.equal(zoneAt(5,-15),'creek'); assert.ok(!walkable(0,1.5)); assert.ok(walkable(-5,0)); assert.ok(!walkable(0,-20));
});
test('shared fire uses server epoch and decays identically', () => {
  assert.equal(fireIntensity(false,0,200),0); assert.equal(fireIntensity(true,1000,1000),1.25);
  assert.ok(fireIntensity(true,1000,41000)<1.25);
});
