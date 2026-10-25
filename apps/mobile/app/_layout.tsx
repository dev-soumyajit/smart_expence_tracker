import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Animated, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { LaunchScreen } from '../components/launch-screen';
import { colors } from '../components/ui';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function LaunchGate({ fontsReady, fontsLoaded, children }: { fontsReady: boolean; fontsLoaded: boolean; children: ReactNode }) {
  const auth = useAuth();
  const [visible, setVisible] = useState(true), [minimumElapsed, setMinimumElapsed] = useState(false), [painted, setPainted] = useState(false), [imageReady, setImageReady] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => { const timer = setTimeout(() => setMinimumElapsed(true), 750); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (fontsReady && painted && imageReady) void SplashScreen.hideAsync().catch(() => {}); }, [fontsReady, painted, imageReady]);
  useEffect(() => {
    if (!fontsReady || !auth.ready || !minimumElapsed || !painted || !imageReady) return;
    const fade = Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true });
    fade.start(({ finished }) => { if (finished) setVisible(false); });
    return () => fade.stop();
  }, [fontsReady, auth.ready, minimumElapsed, painted, imageReady, opacity]);
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <StatusBar style="dark" />
    {fontsReady && auth.ready && children}
    {visible && <Animated.View onLayout={() => setPainted(true)} style={{ position: 'absolute', inset: 0, zIndex: 10, opacity }}><LaunchScreen fontsReady={fontsLoaded} waitingForAccount={!auth.ready} onImageReady={() => setImageReady(true)} /></Animated.View>}
  </View>;
}

export default function Root(){
  const [fontsReady, fontError]=useFonts({Manrope_400Regular,Manrope_500Medium,Manrope_600SemiBold,Manrope_700Bold,Manrope_800ExtraBold});
  const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,staleTime:15000},mutations:{retry:false}}}));
  return <SafeAreaProvider><QueryClientProvider client={client}><AuthProvider><LaunchGate fontsReady={fontsReady || !!fontError} fontsLoaded={fontsReady}><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.bg}}}><Stack.Screen name="(tabs)"/><Stack.Screen name="login"/><Stack.Screen name="add" options={{presentation:'modal'}}/><Stack.Screen name="design-preview"/></Stack></LaunchGate></AuthProvider></QueryClientProvider></SafeAreaProvider>;
}
