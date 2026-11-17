// Refresh the WebGL fallback from the actual scene. Requires the local scene lab.
import {chromium} from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),base=process.env.TEST_BASE_URL||'http://localhost:3000';await page.goto(base);await page.locator('.enter-camp').click();await page.waitForFunction(()=>document.querySelector('main')?.dataset.graphics==='3d');await page.waitForTimeout(1800);
 await fs.mkdir('public/stills',{recursive:true});
 for(const[phase,label]of[['dawn','새벽'],['day','낮'],['dusk','노을'],['night','밤']]){
  await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByRole('button',{name:'날씨·시간 실험실'}).click();await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'닫기',exact:true}).click();
  for(const zone of['fire','creek','deck','shelter']){
   if(zone==='shelter')await page.getByRole('button',{name:'내 텐트',exact:true}).click();
   else{await page.getByRole('button',{name:'캠핑장 지도'}).click();await page.getByRole('button',{name:{fire:'공동 화로',creek:'계곡으로',deck:'전망 데크로'}[zone],exact:true}).click();}
   await page.waitForTimeout(1100);const data=await page.locator('canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]);await sharp(Buffer.from(data,'base64')).resize(1280,800).webp({quality:83}).toFile(`public/stills/${zone}-${phase}.webp`);
   if(zone==='shelter')await page.getByRole('button',{name:'밖으로',exact:true}).click();
  }
  console.log(`Rendered ${phase}`);
 }
}finally{await browser.close();}
