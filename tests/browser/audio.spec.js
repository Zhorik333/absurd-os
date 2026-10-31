import {test,expect} from '@playwright/test';
test('переход с 60% вызывает критическую тревогу, а не обычный звук',async({page})=>{
 await page.addInitScript(()=>{window.__tones=[];window.AudioContext=class{currentTime=0;destination={};resume(){return Promise.resolve()}createOscillator(){return{frequency:{setValueAtTime(f){window.__tones.push(f)}},connect(){},start(){},stop(){}}}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}}});
 await page.goto('./');await page.evaluate(()=>localStorage.setItem('absurd-os:universe:v1',JSON.stringify({chaos:60,settings:{sound:true,effects:false}})));await page.reload();await page.getByRole('button',{name:'Запустить хаос',exact:true}).click();expect(await page.evaluate(()=>window.__tones)).toEqual([660,440,660]);
});
