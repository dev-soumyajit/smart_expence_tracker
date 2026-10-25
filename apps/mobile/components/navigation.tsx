import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, shadow, type IconName } from './ui';

export const destinations: { name: string; label: string; icon: IconName; selectedIcon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', selectedIcon: 'home' },
  { name: 'transactions', label: 'Activity', icon: 'receipt-outline', selectedIcon: 'receipt' },
  { name: 'budgets', label: 'Plan', icon: 'pie-chart-outline', selectedIcon: 'pie-chart' },
  { name: 'accounts', label: 'Wallets', icon: 'wallet-outline', selectedIcon: 'wallet' },
];
export function FloatingNavigation({ active, onSelect, onAdd, bottom = 12 }: { active: string; onSelect: (name: string) => void; onAdd: () => void; bottom?: number }) {
  return <View style={[nav.shell, { bottom: Math.max(12, bottom) }]}>
    {destinations.map((item, index) => <Fragment key={item.name}>{index === 2 && <View style={nav.addSlot}><Pressable accessibilityRole="button" accessibilityLabel="Add transaction" onPress={onAdd} style={({ pressed }) => [nav.add, pressed && { opacity: .75, transform: [{ scale: .95 }] }]}><Ionicons name="add" size={28} color={colors.forest} /></Pressable></View>}<Pressable accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active === item.name }} onPress={() => onSelect(item.name)} style={nav.item}><View style={[nav.icon, active === item.name && { backgroundColor: colors.limeSoft }]}><Ionicons name={active === item.name ? item.selectedIcon : item.icon} size={20} color={active === item.name ? colors.forest : '#96A095'} /></View><Text style={[nav.label, active === item.name && { color: colors.forest, fontFamily: fonts.bold }]}>{item.label}</Text></Pressable></Fragment>)}
  </View>;
}
const nav = StyleSheet.create({
  shell: { position: 'absolute', left: 18, right: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: '#E7EBE3', borderRadius: 27, height: 79, paddingHorizontal: 8, ...shadow, shadowOpacity: .1, elevation: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 66 },
  icon: { width: 43, height: 31, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.medium, fontSize: 10, color: '#75816F' },
  addSlot: { flex: 1, alignItems: 'center' },
  add: { width: 57, height: 57, borderRadius: 21, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', marginTop: -30, borderWidth: 5, borderColor: colors.white },
});
