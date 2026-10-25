const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium,expect}=require('../apps/web/node_modules/@playwright/test');
const config=require('../apps/mobile/app.json').expo;
const versionLabel='Version '+config.version+' ? Build '+config.android.versionCode;
const output=path.resolve(__dirname,'../.artifacts/mobile-profile');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Kolkata',reducedMotion:'reduce'});
  const errors=[];let apiCalls=0;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/v1/'))apiCalls++;});
  const button=name=>page.getByRole('button',{name,exact:true});
  const open=async(mode='')=>{await page.goto('http://localhost:8091/design-preview?screen=settings&profileCase='+mode,{timeout:180000});await expect(button('Edit profile')).toBeVisible({timeout:180000});await page.evaluate(()=>document.fonts.ready);};
  try{
    await open();await page.screenshot({path:path.join(output,'01-profile.png'),animations:'disabled'});
    await expect(page.getByText('Version 0.1.0 · Build 1',{exact:true}).first()).toBeAttached();
    await button('Edit profile').click();await page.getByLabel('Your name',{exact:true}).fill('   ');await button('Save profile').click();await expect(page.getByText('Use a name between 1 and 80 characters.',{exact:true})).toBeVisible();
    await page.getByLabel('Your name',{exact:true}).fill('Taylor Morgan');await button('Save profile').click();await expect(page.getByText('Profile updated.',{exact:true})).toBeVisible();await expect(page.getByText('Taylor Morgan',{exact:true})).toBeVisible();
    await button('Money preferences').click();await page.getByLabel('Salary-cycle start day · 1 to 31',{exact:true}).fill('32');await button('Save money preferences').click();await expect(page.getByText('Enter a salary-cycle day from 1 to 31.',{exact:true})).toBeVisible();
    await page.getByLabel('Salary-cycle start day · 1 to 31',{exact:true}).fill('31');await page.getByLabel('Minimum reserve · INR',{exact:true}).fill('-1');await button('Save money preferences').click();await expect(page.getByText('Your minimum reserve cannot be negative.',{exact:true})).toBeVisible();
    await page.getByLabel('Minimum reserve · INR',{exact:true}).fill('2500.50');await button('Save money preferences').click();await expect(page.getByText('Money preferences updated.',{exact:true})).toBeVisible();await expect(page.getByText('Cycle starts on day 31 · reserve ₹2,500.50',{exact:true})).toBeVisible();
    await button('Device permissions').click();await expect(page.getByText('Example device settings requested.',{exact:true})).toBeAttached();
    await button('Forget learned SMS choices').click();await button('Close').click();await button('Forget learned SMS choices').click();await button('Forget these choices').click();await expect(page.getByText('Learned SMS choices cleared.',{exact:true})).toBeVisible();
    await button('Export my data').click();await expect(page.getByText(/Amounts are integer paise/)).toBeVisible();await button('Create export & choose destination').click();await expect(page.getByText('Example export requested. No data was downloaded or shared.',{exact:true})).toBeAttached();
    await button('Privacy & your data').click();await expect(page.getByText('Phone messages stay local',{exact:true})).toBeVisible();await button('Close').click();
    await button('Help & FAQs').click();await expect(page.getByText('How do I correct a message entry?',{exact:true})).toBeVisible();await button('Close').click();
    await button('About Morrowmint').click();await expect(page.getByText('Version '+config.version+'\nBuild '+config.android.versionCode+'\nCurrency: INR\nTimezone: Asia/Kolkata',{exact:true})).toBeVisible();await page.screenshot({path:path.join(output,'02-about.png'),animations:'disabled'});await button('Close').click();
    await button('Delete account').click();await expect(button('Permanently delete my account')).toBeDisabled();await page.getByLabel('Current password',{exact:true}).fill('wrong');await page.getByLabel('Type DELETE to confirm',{exact:true}).fill('DELETE');await button('Permanently delete my account').click();await expect(page.getByText('Example password rejected. Check your password and try again.',{exact:true})).toBeVisible();await button('Keep my account').click();
    await button('Delete account').click();await expect(page.getByLabel('Current password',{exact:true})).toHaveValue('');await expect(button('Permanently delete my account')).toBeDisabled();await button('Keep my account').click();
    await button('Sign out of all sessions').click();await expect(page.getByText('Sign out everywhere?',{exact:true})).toBeVisible();await button('Close').click();await expect(button('Edit profile')).toBeAttached();
    await open('failure');await button('Edit profile').click();await page.getByLabel('Your name',{exact:true}).fill('Keep these edits');await button('Save profile').click();await expect(page.getByText('Example server unavailable. Your edits are still here.',{exact:true})).toBeVisible();await expect(page.getByLabel('Your name',{exact:true})).toHaveValue('Keep these edits');await button('Close').click();
    await button('Sign out of all sessions').click();await button('Confirm sign out').click();await expect(page.getByText('Example sign-out failed. You are still signed in.',{exact:true})).toBeVisible();await button('Close').click();
    await open();await button('Wallets & accounts').click();await expect(page.getByText('All together now.',{exact:true})).toBeVisible();
    await open();await button('Budgets & spending plans').click();await expect(page.getByText('A plan that fits.',{exact:true})).toBeVisible();
    await open();await button('Smart message review').click();await expect(page.getByText('Does this look right?',{exact:true})).toBeVisible();
    await page.setViewportSize({width:360,height:800});await open();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:path.join(output,'03-small-phone.png'),animations:'disabled'});
    await button('Sign out of all sessions').click();await button('Confirm sign out').click();await expect(page.getByText('Welcome back, you.',{exact:true})).toBeVisible();
    assert.deepEqual(errors,[]);assert.equal(apiCalls,0);console.log('PASS: profile editing/validation, money preferences, version/build, permission controls, forgotten choices, export confirmation, privacy/help, deletion guards, password clearing, sign-out confirmation/failure, navigation, and 390px/360px layouts. No API requests.');
  }catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'failure.txt'),await page.locator('body').innerText().catch(()=>''));throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
