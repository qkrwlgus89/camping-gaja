import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
async function closeSheet(page: Page) { await page.getByRole('button', { name: '닫기', exact: true }).click(); }
async function labWeather(page: Page, name: string) { await page.getByRole('button', { name: '날씨·시간 실험실' }).click(); await page.getByRole('button', { name, exact: true }).click(); await closeSheet(page); }
async function mapTravel(page: Page, name: string) { if (!(await page.getByRole('button', { name: `${name}로 이동`, exact: true }).isVisible())) await page.getByRole('button', { name: /CAMP MAP/ }).click(); await page.getByRole('button', { name: `${name}로 이동`, exact: true }).click(); }
test('desktop 3D renders, keyboard movement, context loss and time fixtures', async ({ page }) => {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await expect(page.locator('main')).toHaveAttribute('data-graphics','3d');
  await expect(page.locator('main')).toHaveAttribute('data-audio','off');
  await page.screenshot({path:'docs/desktop-night.png'});
  await page.getByRole('button',{name:'날씨·시간 실험실'}).click();await page.getByRole('button',{name:'낮',exact:true}).click();await closeSheet(page);
  await page.waitForTimeout(1800);await page.screenshot({path:'docs/desktop-day.png'});
  await page.getByRole('button',{name:/일어나기/}).click(); await expect(page.locator('main')).toHaveAttribute('data-pose','standing');
  await page.locator('.look-area').click({position:{x:550,y:380}}); await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  expect(Number(await page.locator('main').getAttribute('data-z'))).toBeLessThan(4.5);
  await page.keyboard.press('j');
  await page.getByRole('button',{name:'날씨·시간 실험실'}).click();await page.getByRole('button',{name:'밤',exact:true}).click();
  await expect(page.locator('.clock-time')).toHaveText('23:59');await page.getByRole('button',{name:'자정',exact:true}).click();await expect(page.locator('.clock-time')).toHaveText('00:00');
  await page.getByRole('button',{name:'WebGL 중단 재현'}).click();await closeSheet(page);
  await expect(page.locator('main')).toHaveAttribute('data-graphics','still'); await mapTravel(page,'계곡가');await expect(page.locator('main')).toHaveAttribute('data-zone','creek');
  expect(errors).toEqual([]);
});
test('two independent desktop and mobile sessions share invites, motion, fire, weather and reconnect', async ({ browser }) => {
  const ca=await browser.newContext({viewport:{width:1440,height:900}}), cb=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const a=await ca.newPage(),b=await cb.newPage();await a.goto('/?view=still');
  await a.getByRole('button',{name:'불 피우기',exact:true}).click();await expect(a.locator('main')).toHaveAttribute('data-fire','lit');
  await a.getByRole('button',{name:'친구 초대',exact:true}).click();
  const link=a.getByRole('textbox',{name:'친구 초대 링크'});await expect(link).toBeVisible();const url=await link.inputValue();expect(url).toContain('#invite=');
  await closeSheet(a);await b.goto(url+'&unused=1');await b.getByRole('button',{name:'캠프 들어가기',exact:true}).click();
  await expect(b.locator('main')).toHaveAttribute('data-connection','connected');await expect(a.getByText('친구와 함께 · 2 / 2')).toBeVisible();
  await expect(b.locator('main')).toHaveAttribute('data-fire','lit');
  await a.getByRole('button',{name:/일어나기/}).click();await a.locator('.look-area').click({position:{x:600,y:350}});await a.keyboard.down('d');
  await expect(b.locator('main')).toHaveAttribute('data-friend-pose','walking');await a.keyboard.up('d');await expect(b.locator('main')).toHaveAttribute('data-friend-pose','standing');
  await a.getByRole('button',{name:/앉기/}).click();await expect(b.locator('main')).toHaveAttribute('data-friend-pose','sitting');
  await a.getByRole('button',{name:'손 인사',exact:true}).click();await expect(b.getByRole('status')).toContainText('손 인사');
  await b.getByRole('button',{name:/일어나기/}).click();const joystick=b.getByRole('group',{name:'가상 조이스틱'});const box=(await joystick.boundingBox())!;
  const cdp=await cb.newCDPSession(b);const x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-28,id:1}]});await b.waitForTimeout(650);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(Number(await b.locator('main').getAttribute('data-z'))).toBeLessThan(2.9);
  const before=Number(await a.locator('main').getAttribute('data-version'));await b.getByRole('button',{name:'장작 넣기',exact:true}).click();await expect.poll(async()=>Number(await a.locator('main').getAttribute('data-version'))).toBeGreaterThan(before);
  for(const [name,kind]of [['비','rain'],['진눈깨비','sleet'],['눈','snow']]){await labWeather(a,name);await expect(b.locator('main')).toHaveAttribute('data-weather',kind);expect(await a.locator('main').getAttribute('data-weather-version')).toBe(await b.locator('main').getAttribute('data-weather-version'));}
  await labWeather(a,'비');await expect(b.locator('main')).toHaveAttribute('data-weather','rain');
  await mapTravel(a,'계곡가');await mapTravel(b,'계곡가');
  await a.getByRole('button',{name:'물수제비',exact:true}).click();const throwStone=a.getByRole('button',{name:'꾹 눌러 돌 던지기',exact:true});await throwStone.focus();await a.keyboard.down('Space');await a.waitForTimeout(900);await a.keyboard.up('Space');await expect(b.locator('main')).toHaveAttribute('data-last-event','skip');await expect(b.getByLabel('물수제비 물결')).toBeVisible();await closeSheet(a);
  await labWeather(a,'눈');await expect(b.locator('main')).toHaveAttribute('data-weather','snow');
  await b.getByRole('button',{name:'소리 켜기',exact:true}).first().click();await expect(b.locator('main')).toHaveAttribute('data-audio','on');await expect(a.locator('main')).toHaveAttribute('data-audio','off');
  await b.reload();await expect(b.locator('main')).toHaveAttribute('data-connection','connected');await expect(b.locator('main')).toHaveAttribute('data-weather','snow');
  await cb.setOffline(true);await expect(b.locator('main')).toHaveAttribute('data-connection','reconnecting');
  await a.getByRole('button',{name:'설정',exact:true}).click();await a.getByRole('button',{name:'불 끄기',exact:true}).click();await closeSheet(a);
  await cb.setOffline(false);await expect(b.locator('main')).toHaveAttribute('data-connection','connected');await expect(b.locator('main')).toHaveAttribute('data-fire','off');
  const cc=await browser.newContext();const c=await cc.newPage();await c.goto(url);await c.getByRole('button',{name:'캠프 들어가기',exact:true}).click();await expect(c.getByRole('dialog').getByRole('alert')).toContainText('모두 찼어요');
  await b.screenshot({path:'docs/mobile-together.png'});
  await b.getByRole('button',{name:'친구 초대',exact:true}).click();await b.getByRole('button',{name:'친구 캠프 나가기',exact:true}).click();await expect(a.locator('main')).toHaveAttribute('data-friend-pose','none');
  await c.getByRole('button',{name:'캠프 들어가기',exact:true}).click();await expect(c.getByRole('dialog').getByRole('alert')).toContainText('이미 사용');
  await ca.close();await cb.close();await cc.close();
});
test('mobile portrait and landscape have no overflow, joystick and 44px main actions', async ({ browser }) => {
  const ctx=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true});const page=await ctx.newPage();await page.goto('/');await expect(page.locator('main')).toHaveAttribute('data-graphics','3d');
  await page.screenshot({path:'docs/mobile-portrait.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const boxes=await page.locator('.action-dock button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right,bottom:r.bottom}}));
  for(const r of boxes){expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.right).toBeLessThanOrEqual(360);expect(r.bottom).toBeLessThanOrEqual(800);}
  await page.setViewportSize({width:800,height:360});await page.screenshot({path:'docs/mobile-landscape.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await ctx.close();
});
test('activities, client-only photo composition, downloadable PNG and sound settings', async ({ page }) => {
  await page.goto('/?view=still');await page.getByRole('button',{name:'불 피우기',exact:true}).click();await page.getByRole('button',{name:'마시멜로 굽기',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'꼬치 돌리기',exact:true}).click();await page.getByRole('button',{name:'꺼내기',exact:true}).click();await page.getByRole('button',{name:'친구에게 보여주기',exact:true}).click();await closeSheet(page);
  await mapTravel(page,'계곡가');await page.getByRole('button',{name:'물수제비',exact:true}).click();const stone=page.getByRole('button',{name:'꾹 눌러 돌 던지기',exact:true});await stone.focus();await page.keyboard.down('Space');await page.waitForTimeout(900);await page.keyboard.up('Space');await expect(page.locator('.result')).toContainText(/통|퐁당/);await closeSheet(page);
  await mapTravel(page,'전망 데크');await page.getByRole('button',{name:'캠프 엽서',exact:true}).click();await expect(page.getByRole('button',{name:'PNG 저장',exact:true})).toBeEnabled();
  let downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 저장',exact:true}).click();let download=await downloadPromise;await download.saveAs('test-results/postcard-no-photo.png');expect(fs.statSync('test-results/postcard-no-photo.png').size).toBeGreaterThan(10000);
  const uploadRequests:string[]=[];page.on('request',r=>{if(r.method()==='POST')uploadRequests.push(r.url())});
  await page.locator('input[type=file]').setInputFiles({name:'test-photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
  await expect(page.getByRole('button',{name:'사진 바꾸기',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'PNG 저장',exact:true})).toBeEnabled();downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 저장',exact:true}).click();download=await downloadPromise;await download.saveAs('test-results/postcard-photo.png');expect(uploadRequests).toEqual([]);
  await closeSheet(page);await page.getByRole('button',{name:'소리 켜기',exact:true}).first().click();await expect(page.locator('main')).toHaveAttribute('data-audio','on');
  await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('slider',{name:'전체 음량'}).fill('0.3');await closeSheet(page);await page.reload();await expect(page.locator('main')).toHaveAttribute('data-audio','off');await page.getByRole('button',{name:'설정',exact:true}).click();await expect(page.getByRole('slider',{name:'전체 음량'})).toHaveValue('0.3');
});
test('weather stale and failure states keep solo usable; time request can fail', async ({ page }) => {
  await page.route('**/api/time',r=>r.abort());await page.route('**/api/weather',r=>r.abort());await page.goto('/?view=still');
  for(const name of ['2시간 경과','API 실패']){await labWeather(page,name);await expect(page.getByText('날씨 정보 갱신 중',{exact:true})).toBeVisible();await page.getByRole('button',{name:'불 피우기',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-fire','lit');await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('button',{name:'불 끄기',exact:true}).click();await closeSheet(page);}
});
