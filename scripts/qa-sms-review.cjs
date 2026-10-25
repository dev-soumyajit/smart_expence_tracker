const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium,expect}=require('../apps/web/node_modules/@playwright/test');
const output=path.resolve(__dirname,'../.artifacts/sms-review');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Kolkata'});
  let apiCalls=0;const errors=[];
  page.on('request',request=>{if(request.url().includes('/api/v1/'))apiCalls++;});
  page.on('pageerror',error=>errors.push(error.message));
  const open=async(mode='expense')=>{await page.goto('http://localhost:8091/design-preview?screen=sms&smsCase='+mode,{timeout:180000});await expect(page.getByText(mode==='correction'?'Correct your saved entry':'Does this look right?',{exact:true})).toBeVisible({timeout:180000});};
  const details=async()=>{await page.getByRole('button',{name:'Check and edit details',exact:true}).click();};
  const wallet=()=>page.getByRole('button',{name:/Everyday account,/}).click();
  const review=()=>page.getByRole('button',{name:'Review entry',exact:true}).click();
  const check=()=>page.getByRole('checkbox',{name:'I checked the amount, wallet, type, category and date/time',exact:true}).click();
  const save=()=>page.getByRole('button',{name:'Confirm & save',exact:true});
  try{
    await open();await page.screenshot({path:path.join(output,'01-message-review.png')});await details();
    await review();await expect(page.getByText('Choose the correct active wallet before recording this entry.',{exact:true})).toBeVisible();
    await wallet();await page.getByRole('button',{name:'Food & dining',exact:true}).click();
    await page.getByLabel('Amount in rupees').fill('130.75');await review();await expect(save()).toBeDisabled();
    await check();await page.getByRole('checkbox',{name:'Remember my wallet and merchant category choices on this device',exact:true}).click();
    await page.screenshot({path:path.join(output,'02-confirm-details.png')});await save().click();
    await expect(page.getByText(/"amount":13075/)).toBeVisible();await expect(page.getByText(/"occurred_at":"2026-10-24T10:15:30\+05:30"/)).toBeVisible();
    await open('ambiguous');await expect(page.getByRole('button',{name:'Check and edit details',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Expense',exact:true}).click();await page.getByRole('button',{name:'₹50.00',exact:true}).click();await details();
    await expect(page.getByLabel('Amount in rupees')).toHaveValue('50.00');
    await open('duplicate');await details();await wallet();await review();await check();await expect(save()).toBeDisabled();
    await page.getByRole('button',{name:'Use this existing entry',exact:true}).click();await save().click();
    await expect(page.getByText(/"existingTransactionId":"example-duplicate"/)).toBeVisible();
    await open('correction');await expect(page.getByLabel('A note to future you')).toHaveValue('Keep this note');
    await page.getByLabel('Amount in rupees').fill('200');await review();await check();await save().click();await expect(page.getByText(/"amount":20000/)).toBeVisible();
    await open('refund');await details();await wallet();await page.getByLabel('What was it for?').fill('Refunded coffee');await review();await expect(page.getByText('Choose the original expense for this refund.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:/₹500.00/,exact:false}).click();await review();await check();await save().click();await expect(page.getByText(/"original_id":"example-original-expense"/)).toBeVisible();
    await open('retry');await details();await wallet();await review();await check();await save().click();
    await expect(page.getByText('Example network failure. Your edits are still here; retry safely.',{exact:true})).toBeVisible();await save().click();await expect(page.getByText(/"amount":12550/)).toBeVisible();
    await page.setViewportSize({width:360,height:800});await open();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.screenshot({path:path.join(output,'03-small-phone.png')});assert.deepEqual(errors,[]);assert.equal(apiCalls,0);
    console.log('PASS: SMS clarification, editable suggestions, required wallet, explicit confirmation, timestamp preservation, duplicate linking, corrections, refunds, failed-save retry and 360px layout. No API requests.');
  }catch(error){await page.screenshot({path:path.join(output,'failure.png')});fs.writeFileSync(path.join(output,'failure.txt'),await page.locator('body').innerText());throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
