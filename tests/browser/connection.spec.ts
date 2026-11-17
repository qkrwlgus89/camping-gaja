import {test,expect} from '@playwright/test';
test('failed guest access disables public chat, shows a contained message and retries without reload',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 let unavailable=true;await page.route('**/api/session',route=>unavailable?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'USE_SUPABASE_AUTH'})}):route.continue());
 await page.goto('/?view=still');await page.locator('.enter-camp').click();await expect(page.locator('main')).toHaveAttribute('data-entered','true');await expect(page.locator('main')).toHaveAttribute('data-connection','local');
 await page.getByRole('button',{name:'캠퍼들과 대화'}).click();const chat=page.getByRole('region',{name:'공동 캠핑장 대화'});
 await expect(chat.getByText('공동 캠핑장에 연결되지 않았어요',{exact:true})).toBeVisible();await expect(chat.getByRole('textbox',{name:'캠퍼들에게 할 말'})).toBeDisabled();await expect(chat.getByRole('button',{name:'대화 보내기'})).toBeDisabled();await expect(chat.getByRole('button',{name:'다시 연결',exact:true})).toBeVisible();
 expect(await chat.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'test-results/connection-failed-mobile.png'});
 unavailable=false;await chat.getByRole('button',{name:'다시 연결',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-connection','connected');await expect(chat.getByRole('textbox',{name:'캠퍼들에게 할 말'})).toBeEnabled();
 await chat.getByRole('textbox',{name:'캠퍼들에게 할 말'}).fill('연결 후에만 전송해요');await chat.getByRole('button',{name:'대화 보내기'}).click();await expect(chat.getByText('연결 후에만 전송해요',{exact:true})).toBeVisible();
});
test('missing campground migration is reported separately and can reconnect after setup',async({page})=>{
 let missing=true;await page.route('**/api/grounds',route=>missing?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'CAMP_SETUP_REQUIRED'})}):route.continue());
 await page.goto('/?view=still');await page.locator('.enter-camp').click();await page.getByRole('button',{name:'캠퍼들과 대화'}).click();const chat=page.getByRole('region',{name:'공동 캠핑장 대화'});await expect(chat).toHaveAttribute('data-error-code','CAMP_SETUP_REQUIRED');await expect(chat).toContainText('공동 캠핑장을 준비 중');await expect(chat.getByRole('textbox')).toBeDisabled();
 missing=false;await chat.getByRole('button',{name:'다시 연결',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-connection','connected');await expect(chat.getByRole('textbox')).toBeEnabled();
});
