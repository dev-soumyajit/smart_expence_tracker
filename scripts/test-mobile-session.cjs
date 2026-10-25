const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../apps/mobile/node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../apps/mobile/lib/api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(handler){
  const storage=new Map(),exports={},calls=[];let expired=0;
  const secure={WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,getItemAsync:async key=>storage.get(key)||null,setItemAsync:async(key,value)=>{storage.set(key,value);},deleteItemAsync:async key=>{storage.delete(key);}};
  const requireMock=name=>{if(name==='expo-secure-store')return secure;if(name==='react-native')return{Platform:{OS:'android'}};throw new Error(name);};
  const fetch=async(url,options)=>{const call={path:new URL(url).pathname,options};calls.push(call);return handler(call,calls);};
  vm.runInNewContext(source,{exports,require:requireMock,process:{env:{EXPO_PUBLIC_API_URL:'http://example.test'}},fetch,AbortSignal,__DEV__:true,Intl,JSON,Error,Promise});
  exports.onExpired(()=>expired++);
  return{...exports,storage,calls,get expired(){return expired;}};
}
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
for(const endpoint of['auth/me','auth/logout'])test(endpoint+' refreshes an expired access token and retries',async()=>{
  let privateCalls=0;
  const env=setup(call=>{if(call.path.endsWith('/auth/refresh'))return response(200,{access_token:'fresh-access',refresh_token:'fresh-refresh'});if(++privateCalls===1)return response(401,{detail:'Expired access'});return response(200,{name:'Example'});});
  await env.storeSession({access_token:'old-access',refresh_token:'old-refresh'});
  const result=await env.api(endpoint,endpoint==='auth/logout'?{method:'POST'}:{});
  assert.equal(result.name,'Example');assert.equal(env.calls.length,3);assert.equal(env.calls[0].options.headers.Authorization,'Bearer old-access');assert.equal(env.calls[2].options.headers.Authorization,'Bearer fresh-access');assert.equal(env.storage.get('ps_refresh'),'fresh-refresh');assert.equal(env.expired,0);
});
test('an already revoked session clears credentials and exits authenticated screens',async()=>{
  const env=setup(call=>response(401,{detail:call.path.endsWith('/auth/refresh')?'Session expired':'Expired access'}));await env.storeSession({access_token:'old-access',refresh_token:'revoked-refresh'});
  await assert.rejects(env.api('auth/me'),/Expired access/);assert.equal(env.storage.has('ps_refresh'),false);assert.equal(env.expired,1);assert.equal(env.calls.length,2);
});
test('incorrect sign-in credentials never trigger refresh or sign-out callbacks',async()=>{
  const env=setup(()=>response(401,{detail:'Incorrect email or password'}));await env.storeSession({access_token:'old-access',refresh_token:'stored-refresh'});
  await assert.rejects(env.api('auth/login',{method:'POST'}),/Incorrect email or password/);assert.equal(env.calls.length,1);assert.equal(env.expired,0);
});
test('concurrent profile and finance requests share one refresh',async()=>{
  const attempts=new Map();let refreshes=0;
  const env=setup(async call=>{if(call.path.endsWith('/auth/refresh')){refreshes++;await new Promise(resolve=>setTimeout(resolve,10));return response(200,{access_token:'fresh-access',refresh_token:'fresh-refresh'});}const attempt=(attempts.get(call.path)||0)+1;attempts.set(call.path,attempt);return attempt===1?response(401,{detail:'Expired'}):response(200,{ok:true});});
  await env.storeSession({access_token:'old-access',refresh_token:'stored-refresh'});const result=await Promise.all([env.api('auth/me'),env.api('accounts')]);assert.ok(result.every(item=>item.ok));assert.equal(refreshes,1);assert.equal(env.expired,0);
});
