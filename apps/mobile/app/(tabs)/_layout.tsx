import { ActivityIndicator, View } from 'react-native';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuth } from '../../lib/auth';
import { FloatingNavigation } from '../../components/navigation';
import { colors } from '../../components/ui';

function TabBar({state,navigation}:BottomTabBarProps){
  const insets=useSafeAreaInsets(),router=useRouter();
  return <FloatingNavigation active={state.routes[state.index].name} bottom={insets.bottom} onAdd={()=>router.push('/add')} onSelect={name=>{
    const route=state.routes.find(item=>item.name===name);
    if(!route)return;
    const event=navigation.emit({type:'tabPress',target:route.key,canPreventDefault:true});
    if(!event.defaultPrevented)navigation.navigate(route.name,route.params);
  }}/>;
}
export default function Layout(){
  const {ready,signedIn}=useAuth();
  if(!ready)return <View style={{flex:1,backgroundColor:colors.bg,justifyContent:'center'}}><ActivityIndicator color={colors.green}/></View>;
  if(!signedIn)return <Redirect href="/login"/>;
  return <Tabs tabBar={props=><TabBar {...props}/>} screenOptions={{headerShown:false,sceneStyle:{backgroundColor:colors.bg}}}>
    <Tabs.Screen name="index" options={{title:'Home'}}/>
    <Tabs.Screen name="transactions" options={{title:'Activity'}}/>
    <Tabs.Screen name="accounts" options={{title:'Wallets'}}/>
    <Tabs.Screen name="budgets" options={{title:'Plan'}}/>
    <Tabs.Screen name="settings" options={{title:'Profile',href:null}}/>
  </Tabs>;
}
