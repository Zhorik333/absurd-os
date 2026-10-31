import {test,expect} from '@playwright/test';
const key='absurd-os:universe:v1';
test('complete V1 save migrates in the browser without losing records or lifetime progress',async({page})=>{
 const {createInitialState,applyEvent,discoverSecret}=await import('../../src/engine.js');
 let old=createInitialState();old=applyEvent(old,{id:'legacy-contact',type:'alien',title:'Старое событие',description:'Не потерять при пробуждении Бориса',emoji:'👽',delta:24,animation:'ufo'},1700000000000);old=discoverSecret(old,'logo');old.settings.sound=true;old.universes=7;
 await page.goto('./');await page.evaluate(({key,old})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(old));},{key,old});await page.reload();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);const backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('absurd-os:backup:v1')));
 expect(backup).toEqual(old);for(const name of ['chaos','catastrophes','history','achievements','secrets','universes','actionTrail'])expect(saved[name]).toEqual(old[name]);expect(saved.schemaVersion).toBe(2);expect(saved.settings.sound).toBe(true);await expect(page.getByTestId('archive-entry')).toHaveCount(1);
});
test('camera has six chaos stages and obeys effects and reduced motion',async({page})=>{
 await page.goto('./');
 for(const [chaos,stage] of [[0,0],[20,0],[21,1],[40,1],[41,2],[60,2],[61,3],[80,3],[81,4],[99,4],[100,5]]){
  await page.evaluate(({key,chaos})=>localStorage.setItem(key,JSON.stringify({chaos,settings:{effects:true}})),{key,chaos});await page.reload();
  await expect(page.getByTestId('anomaly-camera')).toHaveAttribute('data-stage',String(stage));
 }
 await expect(page.getByRole('dialog')).toContainText('БОРИС');
 await page.getByRole('button',{name:'Перезапустить вселенную',exact:true}).click();
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByLabel('Интенсивные эффекты').uncheck();await page.keyboard.press('Escape');
 await expect(page.getByTestId('anomaly-camera')).toHaveAttribute('data-effects','false');
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.outer-ring').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
test('hidden achievements stay secret and sound channel preferences persist',async({page})=>{
 await page.goto('./');await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.getByRole('button',{name:'Достижения',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Первый разговор');await expect(page.getByRole('dialog')).not.toContainText('Чайная дипломатия');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByLabel('Громкость').fill('0.25');await page.getByLabel('Звуковой канал: Борис').uncheck();await page.keyboard.press('Escape');await page.reload();await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.getByLabel('Громкость')).toHaveValue('0.25');await expect(page.getByLabel('Звуковой канал: Борис')).not.toBeChecked();
});
