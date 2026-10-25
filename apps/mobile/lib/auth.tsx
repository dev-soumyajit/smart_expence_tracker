import { createContext,useContext,useEffect,useState } from 'react';
import { restoreSession,onExpired } from './api';
import { useQueryClient } from '@tanstack/react-query';
const AuthContext=createContext({ready:false,signedIn:false,setSignedIn:(_value:boolean)=>{}});
export function AuthProvider({children}:{children:React.ReactNode}){
  const cache=useQueryClient();
  const [ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false);
  useEffect(()=>{
    let active=true;
    onExpired(()=>{cache.clear();setSignedIn(false);});
    restoreSession().then(value=>{if(active)setSignedIn(value);}).catch(()=>{if(active)setSignedIn(false);}).finally(()=>{if(active)setReady(true);});
    return()=>{active=false;onExpired(()=>{});};
  },[cache]);
  return <AuthContext.Provider value={{ready,signedIn,setSignedIn}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
