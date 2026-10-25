import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';

export const colors = {
  bg: '#F6F7F2', panel: '#FFFFFF', surface: '#EDF0E8', border: '#E3E8DF',
  text: '#18392F', muted: '#677568', green: '#214E3C', forest: '#163D30',
  lime: '#D8EF8A', limeSoft: '#EDF5D9', lavender: '#EBE7F5', purple: '#7A6A9A',
  peach: '#FAE9DB', orange: '#AF7546', red: '#BD5A50', redSoft: '#FCEEEB',
  blue: '#E5EEF8', blueInk: '#52779B', white: '#FFFFFF', onDark: '#C4D8CA',
};
export const fonts = { regular: 'Manrope_400Regular', medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', extra: 'Manrope_800ExtraBold' };
export type IconName = ComponentProps<typeof Ionicons>['name'];
export const shadow = { shadowColor: '#243F2D', shadowOpacity: .055, shadowRadius: 20, shadowOffset: { width: 0, height: 7 }, elevation: 2 };

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 126, gap: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontFamily: fonts.extra, color: colors.text, fontSize: 30, lineHeight: 39, letterSpacing: -1.35 },
  overline: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.8, color: colors.muted },
  subtitle: { fontFamily: fonts.regular, color: colors.muted, fontSize: 13, lineHeight: 22 },
  card: { backgroundColor: colors.panel, borderRadius: 26, padding: 22, gap: 15, ...shadow },
  cardTitle: { fontFamily: fonts.bold, color: colors.text, fontSize: 17, letterSpacing: -.55 },
  label: { fontFamily: fonts.semibold, color: colors.text, fontSize: 12, marginBottom: 10 },
  input: { fontFamily: fonts.medium, fontSize: 14, color: colors.text, minHeight: 52, flex: 1, paddingVertical: 14 },
  inputWrap: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 15 },
  button: { backgroundColor: colors.forest, borderRadius: 18, minHeight: 55, paddingHorizontal: 19, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { fontFamily: fonts.bold, color: colors.white, fontSize: 13 },
  secondary: { backgroundColor: colors.surface }, secondaryText: { color: colors.text },
  error: { fontFamily: fonts.medium, color: colors.red, fontSize: 12, lineHeight: 20 },
  errorBox: { backgroundColor: colors.redSoft, borderRadius: 14, padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  text: { fontFamily: fonts.medium, color: colors.text, fontSize: 13, lineHeight: 22 },
  amount: { fontFamily: fonts.bold, color: colors.text, fontSize: 35, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  small: { fontFamily: fonts.regular, color: colors.muted, fontSize: 11, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border },
  chip: { borderRadius: 13, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: colors.panel, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  selected: { borderColor: colors.forest, backgroundColor: colors.forest },
  progress: { height: 7, backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.green, borderRadius: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontFamily: fonts.extra, color: colors.text, fontSize: 22, letterSpacing: -1.15 },
  link: { fontFamily: fonts.bold, color: colors.green, fontSize: 12, paddingVertical: 12 },
  disabled: { opacity: .45 },
  empty: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 18, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontFamily: fonts.bold, color: colors.text, fontSize: 18, letterSpacing: -.6 },
  circleButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel },
  note: { flexDirection: 'row', gap: 10, backgroundColor: colors.surface, padding: 16, borderRadius: 18 },
  sheetBackdrop: { flex: 1, backgroundColor: '#102B2670', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '91%', width: '100%', maxWidth: 560, alignSelf: 'center' },
  sheetContent: { paddingHorizontal: 24, paddingBottom: 24, gap: 21 },
});

export function BrandMark({ size = 34, color = colors.forest, background = colors.lime }: { size?: number; color?: string; background?: string }) {
  return <View style={{ width: size, height: size, borderRadius: size * .32, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size * .68} height={size * .68} viewBox="0 0 32 32"><Path d="M6 25V14C6 7 12 6 16 12C20 6 26 7 26 14V25H20V15C20 12 18 12 16 16C14 12 12 12 12 15V25Z" fill={color} /><Path d="M18 5C19 1 24 0 27 2C26 6 22 8 18 5Z" fill={color} opacity={.7} /></Svg>
  </View>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><BrandMark size={compact ? 31 : 36} /><Text style={[styles.logo, compact && { fontSize: 19 }]}>morrowmint<Text style={{ color: '#84A853' }}>.</Text></Text></View>;
}
export function IconButton({ icon, label, onPress, background = colors.panel, color = colors.text, disabled = false }: { icon: IconName; label: string; onPress: () => void; background?: string; color?: string; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} hitSlop={5} onPress={onPress} style={({ pressed }) => [styles.circleButton, { backgroundColor: background, opacity: disabled ? .35 : pressed ? .65 : 1 }]}><Ionicons name={icon} size={20} color={color} /></Pressable>;
}
export function Button({ title, onPress, busy = false, disabled = false, secondary = false, icon, lime = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; icon?: IconName; lime?: boolean }) {
  const darkText = secondary || lime;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy || disabled }} onPress={onPress} disabled={busy || disabled} style={({ pressed }) => [styles.button, secondary && styles.secondary, lime && { backgroundColor: colors.lime }, (busy || disabled) && styles.disabled, pressed && { opacity: .8, transform: [{ scale: .99 }] }]}>
    {busy ? <ActivityIndicator color={darkText ? colors.forest : colors.white} /> : <><Text style={[styles.buttonText, darkText && styles.secondaryText]}>{title}</Text>{icon && <Ionicons name={icon} size={18} color={darkText ? colors.forest : colors.white} />}</>}
  </Pressable>;
}
export function Field({ label, icon, right, error, style, ...props }: ComponentProps<typeof TextInput> & { label: string; icon?: IconName; right?: ReactNode; error?: string }) {
  return <View><Text style={styles.label}>{label}</Text><View style={[styles.inputWrap, !!error && { borderColor: colors.red }]}>{icon && <Ionicons name={icon} size={18} color={colors.muted} />}<TextInput style={[styles.input, style]} placeholderTextColor="#A4ACA3" accessibilityLabel={label} {...props} />{right}</View>{!!error && <Text style={[styles.error, { marginTop: 7 }]}>{error}</Text>}</View>;
}
export function SectionHeading({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action && <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.link}>{action}</Text></Pressable>}</View>;
}
export function Chip({ title, selected, onPress, icon }: { title: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: !!selected }} onPress={onPress} style={[styles.chip, selected && styles.selected, { flexDirection: 'row', alignItems: 'center', gap: 7 }]}>{icon && <Ionicons name={icon} size={15} color={selected ? colors.lime : colors.muted} />}<Text style={{ fontFamily: selected ? fonts.bold : fonts.medium, color: selected ? colors.white : colors.muted, fontSize: 12 }}>{title}</Text></Pressable>;
}
export function EmptyState({ title, detail, icon = 'leaf-outline', action, onAction }: { title: string; detail: string; icon?: IconName; action?: string; onAction?: () => void }) {
  return <View style={styles.empty}><View style={{ width: 60, height: 60, borderRadius: 22, backgroundColor: colors.limeSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }}><Ionicons name={icon} color={colors.green} size={26} /></View><Text style={[styles.cardTitle, { textAlign: 'center' }]}>{title}</Text><Text style={[styles.subtitle, { textAlign: 'center', maxWidth: 280 }]}>{detail}</Text>{action && onAction && <Pressable accessibilityRole="button" onPress={onAction} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.link}>{action}  ↗</Text></Pressable>}</View>;
}
export function ErrorBox({ message }: { message: string }) { return <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{message}</Text></View>; }
export function LoadingCards() {
  return <View accessibilityLabel="Loading your money overview" style={{ gap: 18 }}><View style={{ height: 220, backgroundColor: '#E7EBE0', borderRadius: 28, justifyContent: 'center' }}><ActivityIndicator color={colors.green} /></View><View style={{ flexDirection: 'row', gap: 14 }}><View style={{ flex: 1, height: 110, borderRadius: 24, backgroundColor: '#E9EDDF' }} /><View style={{ flex: 1, height: 110, borderRadius: 24, backgroundColor: '#ECE9F1' }} /></View><Text style={styles.small}>Bringing your money into focus…</Text></View>;
}
export function Sheet({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}><Pressable accessibilityLabel="Close sheet" onPress={onClose} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={styles.sheet}><View style={{ height: 5, width: 36, borderRadius: 4, backgroundColor: '#D4DBCF', alignSelf: 'center', marginTop: 11, marginBottom: 22 }} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 22) }]}><View style={styles.row}><View style={{ flex: 1, gap: 7 }}><Text style={[styles.title, { fontSize: 25, lineHeight: 32 }]}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View><IconButton icon="close" label="Close" onPress={onClose} background={colors.surface} /></View>{children}</ScrollView></View></KeyboardAvoidingView></Modal>;
}
