import {test,expect} from '@playwright/test';

test('real registration, accounts, bank/cash transfers, ledger and protected cookies',async({page,context})=>{
  const email=`browser-${Date.now()}@example.com`,password='browser-test-passphrase-123';
  await page.goto('/login');
  await page.getByRole('button',{name:'Create an account',exact:true}).click();
  await page.getByLabel('Your name').fill('Browser Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password',{exact:true}).fill(password);
  const [registration]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/register')),page.getByRole('button',{name:'Create your account',exact:true}).click()]);
  expect(registration.ok(),await registration.text()).toBe(true);
  expect((await registration.json()).access_token).toBeUndefined();
  await expect(page.getByRole('heading',{name:'Hello, Browser.'})).toBeVisible();
  try{
    const cookies=await context.cookies();
    expect(cookies.find(c=>c.name==='ps_access')?.httpOnly).toBe(true);
    expect(cookies.find(c=>c.name==='ps_refresh')?.httpOnly).toBe(true);
    expect(await page.evaluate(()=>document.cookie)).not.toContain('ps_access');
    await page.getByRole('button',{name:'Add your first account',exact:true}).click();
    await page.getByLabel('Account name').fill('Test Bank');
    await page.getByLabel('Opening signed balance · INR').fill('10000.00');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('button',{name:'Add transaction',exact:true}).click();
    await page.getByLabel('Amount · INR',{exact:true}).fill('250.50');
    await page.getByLabel('Description',{exact:true}).fill('Browser lunch');
    await page.getByLabel('From account').selectOption({label:'Test Bank · ₹10,000'});
    await page.getByRole('combobox',{name:'Category',exact:true}).selectOption({label:'Food & dining'});
    await page.getByRole('button',{name:'Confirm & save'}).click();
    await expect(page.getByText('Browser lunch',{exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Accounts',exact:true}).click();
    await page.getByRole('button',{name:'Add account',exact:true}).click();
    await page.getByLabel('Account name').fill('Test Cash');
    await page.getByLabel('Account type').selectOption('cash');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('link',{name:'Cash wallet',exact:true}).click();
    await page.getByRole('button',{name:'Move money'}).click();
    await page.getByLabel('Amount · INR',{exact:true}).fill('2000');
    await page.getByLabel('Description',{exact:true}).fill('ATM transfer');
    await page.getByLabel('From account').selectOption({label:'Test Bank · ₹9,749.5'});
    await page.getByLabel('To account').selectOption({label:'Test Cash'});
    await page.getByRole('button',{name:'Confirm & save'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const data=await (await page.request.get('/api/dashboard')).json();
    expect(data.expenses).toBe(25050);
    expect(data.available).toBe(974950);
    expect(data.accounts.find((a:{name:string})=>a.name==='Test Cash').balance).toBe(200000);
    await page.getByRole('link',{name:'Overview',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Hello, Browser.'})).toBeVisible();
    await page.screenshot({path:'../../.artifacts/dashboard-desktop.png',fullPage:true,animations:'disabled'});
    // Expired access credentials refresh through HTTP-only cookies without JS seeing tokens.
    await context.clearCookies({name:'ps_access'});
    await page.reload();
    await expect(page.getByRole('heading',{name:'Hello, Browser.'})).toBeVisible();
    expect((await context.cookies()).some(c=>c.name==='ps_access')).toBe(true);
    await page.setViewportSize({width:390,height:844});
    await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:'../../.artifacts/dashboard-mobile.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Open menu',exact:true}).click();
    await page.getByRole('link',{name:'Transactions',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
    await page.getByRole('textbox',{name:'Search transactions'}).fill('Browser lunch');
    await expect(page.getByText('Browser lunch',{exact:true})).toBeVisible();
  }finally{
    const response=await page.request.delete('/api/settings/account',{headers:{Origin:'http://localhost:3000'},data:{email,password}});
    expect(response.ok()).toBe(true);
  }
});

test('rejects cross-origin writes and handles backend failure',async({page})=>{
  const response=await page.request.post('/api/auth/login',{headers:{Origin:'https://untrusted.invalid'},data:{email:'a@example.com',password:'any-password-123'}});
  expect(response.status()).toBe(403);
  await page.route('**/api/auth/me',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'The backend is waking up. Please retry.'})}));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
  await expect(page.getByText('The backend is waking up. Please retry.')).toBeVisible();
});
