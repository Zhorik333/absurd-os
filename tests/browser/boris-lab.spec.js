import {test,expect} from '@playwright/test';
import {EXPERIMENTS} from '../../src/experiments.js';
import {MOODS} from '../../src/boris.js';
const key='absurd-os:universe:v1';
async function lab(page,patch={}){
 await page.goto('./');await page.evaluate(({key,patch})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify({schemaVersion:2,chaos:12,boris:{mood:'curious',trust:35,chat:[]},...patch}));},{key,patch});await page.goto('./#boris');await page.reload();
 await expect(page.getByRole('heading',{name:'Лаборатория Бориса',exact:true})).toBeVisible();
}
test('catalogue exposes every experiment and confirms without mutating on cancel',async({page})=>{
 await lab(page);
 for(const item of EXPERIMENTS){
  const card=page.locator('.bl-experiment').filter({has:page.getByRole('heading',{name:item.title,exact:true})});
  await expect(card).toContainText(item.description);await expect(card).toContainText(item.consequences);await expect(card).toContainText(`${Math.round(item.probability*100)}%`);
  await card.getByRole('button').click();await expect(page.getByRole('dialog')).toContainText(item.title);await page.keyboard.press('Escape');
 }
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).history.length,key)).toBe(0);
});
test('eight moods have distinct visual poses and motion is optional at narrow widths',async({page})=>{
 const poses=[];
 for(const mood of MOODS){
  await lab(page,{boris:{mood:mood.id,trust:76,chat:[]},settings:{effects:false}});
  await expect(page.getByRole('img',{name:`Борис: ${mood.label}`})).toBeVisible();
  poses.push(await page.locator('.bl-portrait').evaluate(el=>{const eye=getComputedStyle(el.querySelector('.bl-eyes i'));const mouth=getComputedStyle(el.querySelector('.bl-mouth'));return [eye.height,eye.width,mouth.width,mouth.transform,mouth.borderRadius].join('|')}));
 }
 expect(new Set(poses).size).toBe(8);
 for(const width of [320,360,390,768,1024,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await expect(page.locator('.bl-avatar')).toHaveCSS('animation-name','none');await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.bl-eyes i').first()).toHaveCSS('animation-name','none');
});
test('AI rate denial falls back locally and disabling AI cancels a pending turn',async({page})=>{
 const endpoint='https://boris-test.example/api';
 await page.route(endpoint,route=>route.fulfill({status:429,contentType:'application/json',body:'{}'}));
 await lab(page,{settings:{ai:true,endpoint,effects:false}});
 await page.getByRole('button',{name:'Спросить Бориса',exact:true}).click();
 await expect(page.getByTestId('boris-mode')).toContainText('Автономный');await expect(page.locator('.bl-notices')).toContainText('Лимит AI');await expect(page.locator('[data-role=boris]')).toHaveCount(1);
 await page.unroute(endpoint);let release;const hold=new Promise(resolve=>release=resolve);
 await page.route(endpoint,async route=>{await hold;await route.abort().catch(()=>{})});
 await page.getByLabel('Сообщение Борису',{exact:true}).fill('Не добавляй отменённый запрос');
 const sent=page.waitForRequest(endpoint);await page.getByRole('button',{name:'Отправить сообщение'}).click();await sent;
 await expect(page.getByRole('button',{name:'Спросить Бориса',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByLabel('Использовать AI-сервер').uncheck();await page.keyboard.press('Escape');release();
 await expect(page.getByRole('button',{name:'Спросить Бориса',exact:true})).toBeEnabled();await expect(page.locator('[data-role=boris]')).toHaveCount(1);await expect(page.locator('[data-role=operator]')).toHaveCount(1);
});
test('real AI response is inert text and receives current bounded world context',async({page})=>{
 const endpoint='https://boris-test.example/api';let request;
 await page.route(endpoint,async route=>{request=route.request().postDataJSON();await route.fulfill({contentType:'application/json',body:JSON.stringify({text:'<img src=x onerror=alert(1)> Ответ нейросети.',command:null,mode:'ai'})})});
 await lab(page,{chaos:95,catastrophes:18,universes:3,settings:{ai:true,endpoint,effects:false}});
 await page.getByLabel('Сообщение Борису',{exact:true}).fill('Что с реальностью?');await page.getByRole('button',{name:'Отправить сообщение'}).click();
 await expect(page.getByTestId('boris-mode')).toContainText('AI');await expect(page.getByRole('img',{name:'Борис: Паника'})).toBeVisible();await expect(page.locator('[data-role=boris]')).toContainText('Ответ нейросети.');await expect(page.locator('.boris-lab img')).toHaveCount(0);
 expect(request.context.chaos).toBe(95);expect(request.context.catastrophes).toBe(18);expect(request.context.universes).toBe(3);expect(request.message).toBe('Что с реальностью?');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).chaos,key)).toBe(95);
});
