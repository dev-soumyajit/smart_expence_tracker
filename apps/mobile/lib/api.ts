import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { publicAuthRoutes } from '../../../packages/contracts/email-auth';
export type Tokens={access_token:string;refresh_token:string};
const base=(process.env.EXPO_PUBLIC_API_URL||'https://morrowmintapi.devsoumyajit.in').trim().replace(/\/+$/,'');
let access:string|null=null;
let refreshing:Promise<boolean>|null=null;
let expired:()=>void=()=>{};
export function onExpired(handler:()=>void){expired=handler;}
export async function storeSession(tokens:Tokens) {
  if(Platform.OS==='web')throw new Error('Use the Next.js web app for browser sign-in. Native credentials require SecureStore.');
  await SecureStore.setItemAsync('ps_refresh',tokens.refresh_token,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  access=tokens.access_token;
}
export async function clearSession(){access=null;await SecureStore.deleteItemAsync('ps_refresh');}
export async function restoreSession(){
  if(Platform.OS==='web')return false;
  const refresh=await SecureStore.getItemAsync('ps_refresh');
  if(!refresh)return false;
  try {
    const r=await fetch(base+'/api/v1/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh}),signal:AbortSignal.timeout(70000)});
    if(!r.ok){if(r.status===401)await clearSession();return false;}
    await storeSession(await r.json());return true;
  }catch{return false;}
}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  if(!__DEV__&&!base.startsWith('https://'))throw new Error('Production mobile API must use HTTPS.');
  const send=()=>fetch(base+'/api/v1/'+path,{...options,headers:{'Content-Type':'application/json',...(access?{Authorization:`Bearer ${access}`} :{}),...options.headers},signal:AbortSignal.timeout(70000)});
  let result=await send();
  const publicAuth=publicAuthRoutes.includes(path.split('?')[0]);
  if(result.status===401&&!publicAuth){
    if(!refreshing)refreshing=restoreSession().finally(()=>{refreshing=null;});
    if(await refreshing)result=await send();
    else expired();
  }
  const data=await result.json();
  if(!result.ok)throw new Error(typeof data.detail==='string'?data.detail:'Check your input and try again.');
  return data;
}
export function money(paise:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise/100);}
