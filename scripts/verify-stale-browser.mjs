// Run with PLAYWRIGHT_MODULE and CHROMIUM_PATH set to installed browser tooling.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port = 34729, base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
try {
 for(let i=0;i<100;i++){try { if((await fetch(base+'/api/health')).ok) break; } catch {} await new Promise(r=>setTimeout(r,30));}
 browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const page = await browser.newPage(); await page.goto(base);
 await page.click('[data-sample="explicit"]'); await page.click('#analyze');
 await page.waitForFunction(()=>!document.querySelector('#export-json').disabled);
 await page.fill('#rfq','Need 10 stainless sheets 4 x 8 ASAP.');
 for(const id of ['explain','export-json','export-csv','export-text']) assert.equal(await page.locator('#'+id).isDisabled(),true);
 assert.match(await page.locator('#status-title').innerText(),/Input changed/);
 await page.click('#analyze'); await page.waitForFunction(()=>!document.querySelector('#explain').disabled);
 let release; const responseReady=new Promise(r=>release=r); let requested; const started=new Promise(r=>requested=r);
 await page.route('**/api/explain',async route=>{requested();await responseReady;await route.fulfill({json:{explanation:'STALE ADVICE',trace:{status:'recorded'}}});});
 await page.click('#explain'); await started;
 const clarification=page.locator('#questions-list input').first();
 await clarification.fill('304'); // editing invalidates while request is pending
 await clarification.fill(''); // clearing is also a change, before blur/reanalysis
 assert.equal(await page.locator('#export-json').isDisabled(),true);
 release(); await page.waitForTimeout(100);
 assert.equal(await page.locator('#explanation').innerText(),'');
 assert.equal(await page.locator('#explain').isDisabled(),true);
 // Delayed quote result must not overwrite newer RFQ edits.
 let finishQuote;const quoteGate=new Promise(r=>finishQuote=r);let quoteRequested;const quoteStarted=new Promise(r=>quoteRequested=r);
 await page.route('**/api/quote',async route=>{const response=await route.fetch();quoteRequested();await quoteGate;await route.fulfill({response});});
 await page.click('#analyze'); await quoteStarted;
 await page.fill('#rfq','Completely different request'); finishQuote(); await page.waitForTimeout(100);
 assert.equal(await page.locator('#export-json').isDisabled(),true);
 assert.match(await page.locator('#status-title').innerText(),/Input changed/);
 console.log('PASS real Chromium: edited RFQ blocks exports/advice; cleared clarification invalidates pending advice; stale quote response ignored');
} finally {await browser?.close();child.kill('SIGTERM');}
