import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('./');await page.evaluate(()=>localStorage.clear());await page.reload()});
test('Борис: чат, контекст, сохранение и отдельная рабочая область',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.getByRole('link',{name:'Борис',exact:true}).click();await expect(page.getByRole('heading',{name:'Лаборатория Бориса',exact:true})).toBeVisible();await expect(page.getByTestId('boris-mode')).toContainText('Автономный');await page.getByLabel('Сообщение Борису').fill('Борис, что с гравитацией?');await page.getByRole('button',{name:'Отправить сообщение'}).click();await expect(page.locator('[data-role="boris"]')).toHaveCount(1);await expect(page.locator('[data-role="operator"]')).toContainText('гравитацией');await page.reload();await expect(page.locator('[data-role="boris"]')).toHaveCount(1);await page.getByRole('link',{name:'Пульт',exact:true}).click();await expect(page.getByRole('button',{name:'Запустить хаос',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('эксперимент требует подтверждения, результат в архиве и полное описание',async({page})=>{
 await page.getByRole('link',{name:'Борис',exact:true}).click();await page.getByRole('button',{name:'Провести эксперимент',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Подтвердить эксперимент');await page.getByRole('button',{name:'Закрыть окно'}).click();await page.getByRole('link',{name:'Архив',exact:false}).click();await expect(page.getByTestId('archive-entry')).toHaveCount(0);await page.getByRole('link',{name:'Борис',exact:true}).click();await page.getByRole('button',{name:'Провести эксперимент',exact:true}).click();await page.getByRole('button',{name:'Да, запускаем'}).click();await expect(page.getByTestId('experiment-result')).toBeVisible();await page.getByRole('link',{name:'Архив',exact:false}).click();await expect(page.getByTestId('archive-entry')).toHaveCount(1);await page.getByRole('button',{name:'Полное описание события'}).click();await expect(page.getByRole('dialog')).toContainText('ЭКСПЕРИМЕНТ');
});
test('experiment result selects the new occurrence ahead of a future-dated V1 archive record',async({page})=>{
 const key='absurd-os:universe:v1';
 const {createInitialState,applyEvent}=await import('../../src/engine.js');
 const old=applyEvent(createInitialState(),{id:'legacy-future',type:'alien',title:'Старое событие из будущего',description:'Архивная запись V1, а не результат эксперимента.',emoji:'👽',delta:1,animation:'ufo'},Date.UTC(2099,0,1));
 await page.evaluate(({key,old})=>localStorage.setItem(key,JSON.stringify(old)),{key,old});await page.reload();
 const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(before.history).toEqual(old.history);expect(before.experiments.count).toBe(0);
 await page.getByRole('link',{name:'Борис',exact:true}).click();
 await page.getByRole('button',{name:'Провести эксперимент',exact:true}).click();await page.getByRole('button',{name:'Да, запускаем'}).click();
 await expect(page.getByTestId('experiment-result')).toBeVisible();
 const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 const previousIds=new Set(before.history.map(entry=>entry.id));
 const added=after.history.filter(entry=>!previousIds.has(entry.id));
 expect(added).toHaveLength(1);expect(added[0].origin).toBe('experiment');
 expect(after.history[0]).toEqual(old.history[0]);expect(after.experiments.count).toBe(before.experiments.count+1);
 await expect(page.getByTestId('experiment-result').getByRole('heading')).toHaveText(added[0].title);
 await expect(page.getByTestId('experiment-result')).toContainText(added[0].description);
 await expect(page.getByTestId('experiment-result')).not.toContainText(old.history[0].title);
 await page.getByRole('link',{name:'Архив',exact:false}).click();
 await expect(page.getByTestId('archive-entry')).toHaveCount(2);
 await expect(page.getByTestId('archive-entry').filter({hasText:old.history[0].title})).toHaveCount(1);
 await expect(page.getByTestId('archive-entry').filter({hasText:added[0].title})).toHaveCount(1);
});
test('AI без сервера честно возвращается к локальному Борису; мобильная лаборатория',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByLabel('Использовать AI-сервер').check();await page.getByRole('button',{name:'Закрыть окно'}).click();await page.getByRole('link',{name:'Борис',exact:true}).click();await page.getByRole('button',{name:'Спросить Бориса',exact:true}).click();await expect(page.getByTestId('boris-mode')).toContainText('Автономный');await expect(page.locator('[data-role="boris"]')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
