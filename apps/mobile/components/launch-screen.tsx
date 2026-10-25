import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from './ui';

export function LaunchScreen({ fontsReady = true, waitingForAccount = false, onImageReady }: { fontsReady?: boolean; waitingForAccount?: boolean; onImageReady?: () => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion) return;
    progress.setValue(0);
    const animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);
  useEffect(() => {
    if (!waitingForAccount) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [waitingForAccount]);
  const face = (font: string) => fontsReady ? { fontFamily: font } : undefined;
  return <View style={[launch.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View pointerEvents="none" style={launch.topLine} />
    <View style={launch.identity} accessibilityLabel="Morrowmint. Make room for tomorrow.">
      <Image source={require('../assets/brand/app-icon.png')} style={launch.icon} onLoad={onImageReady} onError={onImageReady} accessible={false} fadeDuration={0} />
      <Text style={[launch.wordmark, face(fonts.extra)]}>morrowmint<Text style={launch.period}>.</Text></Text>
      <Text style={[launch.tagline, face(fonts.medium)]}>Make room for tomorrow.</Text>
    </View>
    <View style={[launch.footer, { bottom: 43 + insets.bottom }]}>
      <View style={launch.track} accessible={false}>
        {reducedMotion ? <View style={[launch.indicator, { marginLeft: 48 }]} /> : <Animated.View style={[launch.indicator, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-48, 144] }) }] }]} />}
      </View>
      <Text accessibilityLiveRegion="polite" style={[launch.status, face(fonts.medium)]}>{slow ? 'Connecting to your account…' : 'Getting things ready…'}</Text>
      {slow && <Text style={[launch.hint, face(fonts.regular)]}>This can take a moment on a quiet connection.</Text>}
      {height >= 680 && <View style={launch.signature}><View style={launch.dot} /><Text style={[launch.signatureText, face(fonts.semibold)]}>A LITTLE MORE CLARITY. EVERY DAY.</Text></View>}
    </View>
  </View>;
}

const launch = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  topLine: { position: 'absolute', top: 0, height: 4, width: '100%', backgroundColor: colors.forest },
  identity: { position: 'absolute', top: '50%', marginTop: -46, alignItems: 'center', paddingHorizontal: 24 },
  icon: { width: 92, height: 92, borderRadius: 27, marginBottom: 27 },
  wordmark: { color: colors.forest, fontSize: 37, letterSpacing: -1.7, lineHeight: 49, fontWeight: '800' },
  period: { color: '#84A853' },
  tagline: { color: colors.muted, fontSize: 14, lineHeight: 24, marginTop: 7, letterSpacing: .1 },
  footer: { position: 'absolute', bottom: 43, left: 24, right: 24, alignItems: 'center', gap: 16 },
  track: { width: 144, height: 3, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  indicator: { width: 48, height: 3, backgroundColor: colors.green, borderRadius: 3 },
  status: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 20 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: -11 },
  signature: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 23 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#84A853' },
  signatureText: { color: colors.muted, fontSize: 8, letterSpacing: 1.25, lineHeight: 14 },
});
