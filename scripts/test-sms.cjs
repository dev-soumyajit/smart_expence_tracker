// Compile packages/contracts/sms.ts to .artifacts/sms-tests/sms.js before running.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseSms,normalizeSender,learnSelection,learnedSuggestion,learningContext,learnContextSelection}=require('../.artifacts/sms-tests/sms.js');
const receipt=Date.parse('2026-10-24T11:00:00+05:30');
const parse=(body,sender='VM-HDFCBK-S')=>parseSms({body,sender,receivedAt:receipt,id:'example'});
for(const [body,kind,amount] of [
  ['Your A/c XX1234 debited INR 1,250.50. UPI Ref 123456789012','expense',125050],
  ['Avl Bal Rs. 50,000.00. A/c XX1234 debited INR 150.25 to Blue Cafe on 24-10-26 at 10:15:30','expense',15025],
  ['Rs 300 refunded to account XX1234','refund',30000],
  ['INR 75,000 credited as salary to A/c XX1234','income',7500000],
  ['ATM cash withdrawal Rs. 2,000.00 debited','transfer',200000],
  ['INR 5,000 credited for credit card payment','transfer',500000],
  ['Paid INR 150 to Blue Cafe using credit card XX1234','expense',15000],
  ['INR 1,23,456.78 debited','expense',12345678],
  ['Rs. 1,234,567.89 received','income',123456789],
  ['INR 25.5 spent. Available balance INR 1000','expense',2550],
  ['A/c XX1234 debited INR125.50. Avl bal INR900.00','expense',12550],
  ['Your account debited INR 23.60 for ATM withdrawal fees',null,2360],
]) test('extract '+body,()=>{const result=parse(body);assert.equal(result.status,'review_required');assert.equal(result.kind,kind);assert.equal(result.amount,amount);});
for(const body of [
  'OTP 123456 for INR 100 debited', 'Your PIN is 4444. INR 100 spent',
  'Payment INR 100 failed', 'INR 100 debited but transaction reversed pending',
  'INR 100 debited request initiated', 'Payment due INR 5000', 'Statement: INR 5000 spent',
  'INR 100 not debited', 'Your account will be credited INR 500 pending',
  'You received a collect request for INR 100', 'INR 100 will be credited to your account',
]) test('ignore '+body,()=>assert.equal(parse(body).status,'ignored'));
for(const body of ['INR -5 debited','INR 1.999 debited','INR 12,34 debited','INR 0 debited','INR 9999999999999999 debited','INR 1e3 debited','INR 1.2.3 debited']) test('never partially parse '+body,()=>assert.equal(parse(body).amount,null));
test('multiple amounts ask instead of guessing',()=>{const result=parse('INR 100 debited; charges Rs 5. Balance INR 10000');assert.equal(result.amount,null);assert.deepEqual(result.amountOptions,[10000,500]);});
test('balance-only message is unsupported',()=>assert.equal(parse('Your balance INR 5000').status,'unsupported'));
test('foreign currency is unsupported',()=>assert.equal(parse('USD 20 spent at a store').status,'unsupported'));
test('opposing directions require a type decision',()=>{const result=parse('INR 100 debited and credited');assert.equal(result.kind,null);assert.ok(result.questions.some(q=>q.includes('Both debit')));});
test('date and seconds use IST',()=>{const result=parse('INR 100 debited on 24-Oct-2026 at 10:15:30');assert.equal(result.occurredAt,'2026-10-24T04:45:30.000Z');assert.equal(result.dateSource,'message');});
test('ISO bank dates without offsets are interpreted as IST',()=>assert.equal(parse('INR 100 debited on 2026-10-24 at 10:15:30').occurredAt,'2026-10-24T04:45:30.000Z'));
test('explicit foreign timezone prompts rather than assuming IST',()=>{const result=parse('INR 100 debited on 2026-10-24T05:15:00Z');assert.equal(result.dateSource,'receipt');assert.ok(result.questions.some(q=>q.includes('timezone')));});
test('invalid leap day asks for a correction',()=>{const result=parse('INR 100 debited on 29-02-2025');assert.equal(result.dateSource,'receipt');assert.ok(result.questions.some(q=>q.includes('invalid')));});
test('future bank date asks for a correction',()=>assert.equal(parse('INR 100 debited on 30-10-2026').dateSource,'receipt'));
test('receipt time is labeled as an assumption',()=>{const result=parse('INR 100 debited');assert.equal(result.dateSource,'receipt');assert.ok(result.questions.some(q=>q.includes('receipt date')));});
test('sender prefixes normalize across carriers',()=>{assert.equal(normalizeSender('VM-HDFCBK-S'),'HDFCBK');assert.equal(normalizeSender('AD-HDFCBK'),'HDFCBK');});
test('reference identity survives duplicate carrier prefixes',()=>assert.equal(parse('A/c XX1234 debited INR 100 UPI Ref 123456789012','VM-HDFCBK-S').identity,parse('A/c XX1234 debited INR 100 UPI Ref 123456789012','AD-HDFCBK').identity));
test('debit/credit sides of same reference remain separate',()=>assert.notEqual(parse('A/c XX1234 debited INR 100 UPI Ref 123456789012').identity,parse('A/c XX1234 credited INR 100 UPI Ref 123456789012').identity));
test('identical small purchases without references are not silently merged',()=>{const message={body:'INR 100 debited',sender:'HDFCBK',receivedAt:receipt,id:'inbox-1'};assert.notEqual(parseSms(message).identity,parseSms({...message,id:'inbox-2',receivedAt:receipt+60000}).identity);assert.equal(parseSms({...message,id:'paste'}).identity,parseSms({...message,id:'paste',receivedAt:receipt+60000}).identity);});
test('masked preview contains no full reference, account or UPI id',()=>{const value=parse('Account 123456789012 debited INR 100 to test@upi Ref 987654321000');assert.ok(!value.preview.includes('123456789012'));assert.ok(!value.preview.includes('987654321000'));assert.ok(!value.preview.includes('test@upi'));});
test('learning suggests only explicitly confirmed active wallet/category',()=>{const suggestion=parse('A/c XX1234 debited INR 100 to Blue Cafe on 24-10-26');const rules=learnSelection({wallets:{},categories:{}},suggestion,'wallet-1','category-1');assert.deepEqual(learnedSuggestion(suggestion,rules,['wallet-1'],['category-1']),{accountId:'wallet-1',categoryId:'category-1'});assert.deepEqual(learnedSuggestion(suggestion,rules,[],[]),{accountId:'',categoryId:''});assert.equal(suggestion.amount,10000);});
test('transfer source is never learned from the credited card tail',()=>{const suggestion=parse('Card XX1234 INR 100 credited for credit card payment');assert.deepEqual(learnSelection({wallets:{},categories:{}},suggestion,'bank',null).wallets,{});});
test('a corrected uncategorized selection removes a wrong learned category',()=>{const suggestion=parse('A/c XX1234 debited INR 100 to Blue Cafe on 24-10-26');let rules=learnSelection({wallets:{},categories:{}},suggestion,'wallet','wrong');rules=learnSelection(rules,suggestion,'wallet',null);assert.equal(Object.keys(rules.categories).length,0);});
test('later corrections update remembered choices without retaining a message body',()=>{const suggestion=parse('A/c XX1234 debited INR 100 to Blue Cafe on 24-10-26');const context=learningContext(suggestion);let rules=learnSelection({wallets:{},categories:{}},suggestion,'wrong-wallet','wrong-category');rules=learnContextSelection(rules,context,'expense','correct-wallet','correct-category');assert.deepEqual(learnedSuggestion(suggestion,rules,['correct-wallet'],['correct-category']),{accountId:'correct-wallet',categoryId:'correct-category'});rules=learnContextSelection(rules,context,'transfer','bank',null);assert.equal(Object.keys(rules.wallets).length,0);assert.equal(Object.keys(rules.categories).length,0);});
test('invalid receipt times and oversized messages fail safely',()=>{assert.equal(parseSms({body:'INR 100 debited',sender:'X',receivedAt:NaN,id:'1'}).status,'unsupported');assert.equal(parse('a'.repeat(3001)).status,'unsupported');});
