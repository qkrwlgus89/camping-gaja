import {test,expect} from '@playwright/test';
test('graphics modes change actual render resolution, retain sharpness and persist',async({browser,baseURL})=>{
 test.setTimeout(120000);const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2}),p=await context.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 const ratio=()=>p.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.width/c.getBoundingClientRect().width);
 async function quality(mode:string){await p.getByRole('button',{name:'설정',exact:true}).click();await p.getByRole('combobox',{name:'그래픽 화질'}).selectOption(mode);await p.getByRole('button',{name:'닫기',exact:true}).click();await expect(p.locator('main')).toHaveAttribute('data-quality',mode);}
 try{
 await p.goto(baseURL!);await p.locator('.enter-camp').click();await expect(p.locator('main')).toHaveAttribute('data-graphics','3d');await expect(p.locator('main')).toHaveAttribute('data-quality','auto');await expect.poll(ratio).toBeCloseTo(1.75,1);
 await quality('light');await expect.poll(ratio).toBeCloseTo(.85,1);await p.screenshot({path:'docs/graphics-light.png'});
 await quality('sharp');await expect.poll(ratio).toBeCloseTo(2,1);await p.waitForTimeout(14000);await expect.poll(ratio).toBeCloseTo(2,1);await p.screenshot({path:'docs/graphics-sharp.png'});
 await p.reload();await expect(p.locator('main')).toHaveAttribute('data-entered','true');await expect(p.locator('main')).toHaveAttribute('data-quality','sharp');await expect.poll(ratio).toBeCloseTo(2,1);
 await p.setViewportSize({width:360,height:800});await expect.poll(ratio).toBeCloseTo(1.75,1);await p.screenshot({path:'docs/graphics-mobile-sharp.png'});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 }finally{
 await p.evaluate(async()=>{const who=JSON.parse(localStorage.getItem('camp-local-guest')||'null');if(who)await fetch('/api/grounds',{method:'POST',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${who.token}`},body:JSON.stringify({action:'leave'})});}).catch(()=>{});await context.close();
 }
});
