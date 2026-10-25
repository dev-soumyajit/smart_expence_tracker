import { useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../components/ui';
export default function Root(){
  const [fontsReady, fontError]=useFonts({Manrope_400Regular,Manrope_500Medium,Manrope_600SemiBold,Manrope_700Bold,Manrope_800ExtraBold});
  const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,staleTime:15000},mutations:{retry:false}}}));
  if(!fontsReady&&!fontError)return <View style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={colors.green}/></View>;
  return <SafeAreaProvider><QueryClientProvider client={client}><AuthProvider><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.bg}}}><Stack.Screen name="(tabs)"/><Stack.Screen name="login"/><Stack.Screen name="add" options={{presentation:'modal'}}/><Stack.Screen name="design-preview"/></Stack></AuthProvider></QueryClientProvider></SafeAreaProvider>;
}
