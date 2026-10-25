import { useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { User } from '../../web/lib/types';
import { parseINR } from '../../../packages/contracts/validation';
import { appInfo } from '../lib/app-info';
import { money } from '../lib/api';
import { Brand, Button, colors, ErrorBox, Field, fonts, IconButton, Sheet, styles, type IconName } from './ui';

type Preferences = Pick<User, 'name' | 'salary_day' | 'minimum_balance'>;
export type ProfileActions = {
  savePreferences: (preferences: Preferences) => Promise<void>;
  exportData: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  forgetSmsChoices: () => Promise<void>;
  managePermissions: () => Promise<void>;
  navigate: (path: 'home' | 'accounts' | 'budgets' | 'sms') => void;
};
type Panel = 'profile' | 'preferences' | 'privacy' | 'help' | 'about' | 'export' | 'delete' | 'logout' | 'forget' | null;

export function ProfilePage({ user, smsStatus, actions, refreshing = false, onRefresh, refreshError, children }: { user: User; smsStatus: string; actions: ProfileActions; refreshing?: boolean; onRefresh?: () => void; refreshError?: string; children?: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [name, setName] = useState(user.name), [salaryDay, setSalaryDay] = useState(String(user.salary_day)), [reserve, setReserve] = useState((user.minimum_balance / 100).toFixed(2));
  const [password, setPassword] = useState(''), [deletionText, setDeletionText] = useState('');
  const running = useRef(false);
  const close = () => { if (!running.current) { setPanel(null); setPassword(''); setDeletionText(''); setError(''); } };
  const open = (next: Panel) => {
    if (running.current) return;
    setName(user.name); setSalaryDay(String(user.salary_day)); setReserve((user.minimum_balance / 100).toFixed(2));
    setPassword(''); setDeletionText(''); setError(''); setNotice(''); setPanel(next);
  };
  const perform = async (work: () => Promise<void>, success = '', dismiss = true) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await work();
      if (dismiss) { setPanel(null); setPassword(''); setDeletionText(''); }
      setNotice(success);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Something went wrong. Please try again.'); }
    finally { running.current = false; setBusy(false); }
  };
  const save = () => perform(async () => {
    if (panel === 'profile') {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 80) throw new Error('Use a name between 1 and 80 characters.');
      await actions.savePreferences({ name: trimmed, salary_day: user.salary_day, minimum_balance: user.minimum_balance });
    } else {
      if (!/^\d{1,2}$/.test(salaryDay.trim())) throw new Error('Enter a salary-cycle day from 1 to 31.');
      const day = Number(salaryDay), minimum = parseINR(reserve);
      if (day < 1 || day > 31) throw new Error('Enter a salary-cycle day from 1 to 31.');
      if (minimum < 0) throw new Error('Your minimum reserve cannot be negative.');
      await actions.savePreferences({ name: user.name, salary_day: day, minimum_balance: minimum });
    }
  }, panel === 'profile' ? 'Profile updated.' : 'Money preferences updated.');
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || 'M';
  const titles: Record<Exclude<Panel, null>, string> = { profile: 'Make yourself at home.', preferences: 'Your money, your rhythm.', privacy: 'Privacy & your data', help: 'A little help.', about: 'Meet Morrowmint.', export: 'Your data, to go.', delete: 'Delete your account?', logout: 'Sign out everywhere?', forget: 'Forget learned choices?' };
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} /> : undefined}>
      <View style={styles.row}><IconButton label="Back to overview" icon="arrow-back" onPress={() => actions.navigate('home')} disabled={busy} /><Brand compact /></View>
      <View style={{ gap: 7 }}><Text style={styles.subtitle}>Your profile</Text><Text style={styles.title}>Make it yours.</Text></View>
      {!!refreshError && <ErrorBox message={refreshError} />}
      <View style={profile.hero}>
        <View style={styles.row}><View style={profile.avatar}><Text style={profile.initials}>{initials}</Text></View><View style={profile.member}><Ionicons name="leaf-outline" size={12} color={colors.lime} /><Text style={profile.memberText}>A little more tomorrow</Text></View></View>
        <View style={{ gap: 6 }}><Text style={profile.name}>{user.name}</Text><Text style={profile.email}>{user.email}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => open('profile')} style={profile.edit}><Ionicons name="pencil-outline" color={colors.lime} size={16} /><Text style={profile.editText}>Edit profile</Text><Ionicons name="arrow-forward" color={colors.lime} size={16} /></Pressable>
      </View>
      <Group title="YOUR MONEY"><ProfileRow icon="calendar-outline" title="Money preferences" detail={'Cycle starts on day ' + user.salary_day + ' · reserve ' + money(user.minimum_balance)} onPress={() => open('preferences')} disabled={busy} /><ProfileRow icon="wallet-outline" title="Wallets & accounts" detail="Bank, cash and credit cards" onPress={() => actions.navigate('accounts')} disabled={busy} /><ProfileRow icon="pie-chart-outline" title="Budgets & spending plans" detail="Make room for what matters" onPress={() => actions.navigate('budgets')} disabled={busy} last /></Group>
      <Group title="MESSAGES & ACCESS"><ProfileRow icon="chatbubble-ellipses-outline" title="Smart message review" detail="Review alerts and correct saved entries" onPress={() => actions.navigate('sms')} disabled={busy} /><ProfileRow icon="options-outline" title="Device permissions" detail={'SMS · ' + smsStatus} onPress={() => void perform(actions.managePermissions, '', false)} disabled={busy} /><ProfileRow icon="refresh-outline" title="Forget learned SMS choices" detail="Reset wallet and merchant category suggestions" onPress={() => open('forget')} disabled={busy} last /></Group>
      <Group title="PRIVACY & ACCOUNT"><ProfileRow icon="shield-checkmark-outline" title="Privacy & your data" detail="Understand what stays on your device" onPress={() => open('privacy')} disabled={busy} /><ProfileRow icon="download-outline" title="Export my data" detail="JSON copy of your profile and financial records" onPress={() => open('export')} disabled={busy} /><ProfileRow icon="trash-outline" title="Delete account" detail="Permanently remove your account and records" onPress={() => open('delete')} disabled={busy} destructive last /></Group>
      <Group title="HELP & APP"><ProfileRow icon="help-circle-outline" title="Help & FAQs" detail="Entries, messages, budgets and balances" onPress={() => open('help')} disabled={busy} /><ProfileRow icon="information-circle-outline" title="About Morrowmint" detail={'Version ' + appInfo.version + ' · Build ' + appInfo.build} onPress={() => open('about')} disabled={busy} last /></Group>
      <DeveloperCredit />
      <View style={styles.note}><Ionicons name="globe-outline" size={19} color={colors.green} /><Text style={[styles.small, { flex: 1 }]}>English · Indian rupee (INR){'\n'}India Standard Time · Asia/Kolkata</Text></View>
      {!!notice && <Text accessibilityLiveRegion="polite" style={[styles.text, { textAlign: 'center' }]}>{notice}</Text>}{!panel && !!error && <ErrorBox message={error} />}
      <Button title="Sign out of all sessions" secondary icon="log-out-outline" disabled={busy} onPress={() => open('logout')} />
      <View style={{ alignItems: 'center', gap: 5 }}><Text style={[styles.cardTitle, { fontSize: 16 }]}>morrowmint.</Text><Text style={styles.small}>Small habits. Brighter tomorrows.</Text><Text style={styles.small}>Version {appInfo.version} · Build {appInfo.build}</Text></View>
      {children}
    </ScrollView>
    <Sheet visible={!!panel} title={panel ? titles[panel] : ''} onClose={close}>
      {panel === 'profile' && <><Field label="Your name" icon="person-outline" value={name} onChangeText={setName} maxLength={80} autoCapitalize="words" editable={!busy} /><Text style={styles.label}>Account email</Text><Text selectable style={styles.text}>{user.email}</Text><Text style={styles.small}>Your email identifies this account. Email changes are not available in the app.</Text><Button title="Save profile" busy={busy} onPress={() => void save()} /></>}
      {panel === 'preferences' && <><Field label="Salary-cycle start day · 1 to 31" value={salaryDay} onChangeText={setSalaryDay} keyboardType="number-pad" maxLength={2} editable={!busy} icon="calendar-outline" /><Field label="Minimum reserve · INR" value={reserve} onChangeText={setReserve} keyboardType="decimal-pad" maxLength={15} editable={!busy} icon="leaf-outline" /><Text style={styles.small}>For a shorter month, your cycle starts on its last day. The reserve is included in your safe-to-spend estimate.</Text><Text style={styles.small}>Currency: Indian rupee · INR{'\n'}Financial dates: India Standard Time</Text><Button title="Save money preferences" busy={busy} onPress={() => void save()} /></>}
      {panel === 'privacy' && <><Info title="Your account records" text="Your profile and confirmed financial records are stored by the backend for your account. Use Export my data to get a copy." /><Info title="Phone messages stay local" text="SMS parsing runs on your phone. Raw messages and OTPs are not sent to the server or AI. The backend receives reviewed financial details and a duplicate-check digest." /><Info title="You control suggestions" text="Remembered SMS wallet/category choices are optional and stored in SecureStore on this device. You can forget them here and manage SMS permission in device settings." /><Info title="AI sharing is optional" text="When you use the assistant in the web app, sharing is chosen for that question. The mobile SMS reviewer does not send messages to an AI service." /><Button title="Manage device permissions" secondary disabled={busy} onPress={() => void perform(actions.managePermissions, '', false)} /><Button title="Export my data" secondary disabled={busy} onPress={() => open('export')} /></>}
      {panel === 'help' && <><Info title="How do I correct a message entry?" text="Open Smart message review, find Saved message entries, then choose Review or correct this entry. Your original stays in the audit history." /><Info title="Why did a message ask for clarification?" text="Several amounts, unclear directions, missing dates or ATM fees need your input. Check the bank app when an alert is unexpected." /><Info title="Why is a transfer not spending?" text="Moving money between your own wallets, withdrawing cash and repaying a credit card move existing money. The actual purchase counts as an expense." /><Info title="How does safe-to-spend work?" text="The server uses your available funds, credit debt, essential bills, goal allocations and minimum reserve. Open the estimate on Home for its current breakdown." /><Info title="How do I manage bills or change my password?" text="Upcoming bills appear from the Home reminder icon. Full bill management is available in the web app. Password changes and recovery are not available yet." /><Button title="Open smart message review" secondary onPress={() => { close(); actions.navigate('sms'); }} /></>}
      {panel === 'about' && <><Brand /><Text style={styles.subtitle}>A calmer relationship with your money, one everyday decision at a time.</Text><View style={styles.note}><Text selectable style={styles.text}>Version {appInfo.version}{'\n'}Build {appInfo.build}{'\n'}Currency: INR{'\n'}Timezone: Asia/Kolkata</Text></View><DeveloperCredit /><Text style={styles.small}>Morrowmint is a personal finance tracker. Confirm messages and financial entries before saving.</Text></>}
      {panel === 'export' && <><Text style={styles.text}>Create a JSON copy of your profile, wallets, transactions, budgets, goals, reminders and audit history.</Text><Text style={styles.small}>Amounts are integer paise. The file contains personal financial information; choose where to save or share it. Exports above 50,000 transactions need assisted export.</Text><Button title="Create export & choose destination" icon="share-outline" busy={busy} onPress={() => void perform(actions.exportData)} /></>}
      {panel === 'forget' && <><Text style={styles.text}>Clear remembered wallet and merchant category choices on this device for your account.</Text><Text style={styles.small}>Your financial records and phone messages stay available. Future suggestions will ask you to choose again.</Text><Button title="Forget these choices" busy={busy} onPress={() => void perform(actions.forgetSmsChoices, 'Learned SMS choices cleared.')} /></>}
      {panel === 'logout' && <><Text style={styles.text}>Sign out of Morrowmint on every device and browser session for this account.</Text><Text style={styles.small}>Your saved financial records remain in your account. You will need to sign in again.</Text><Button title="Confirm sign out" busy={busy} icon="log-out-outline" onPress={() => void perform(actions.signOut)} /></>}
      {panel === 'delete' && <><View style={styles.errorBox}><Text style={styles.error}>This permanently deletes your account and its financial records from this service. Export a copy first if you need one.</Text></View><Text style={styles.text}>Confirm the password for {user.email} and type DELETE to continue.</Text><Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!busy} textContentType="password" /><Field label="Type DELETE to confirm" value={deletionText} onChangeText={setDeletionText} autoCapitalize="characters" autoCorrect={false} maxLength={6} editable={!busy} /><Button title="Permanently delete my account" busy={busy} disabled={!password || deletionText !== 'DELETE'} onPress={() => void perform(() => actions.deleteAccount(password))} /><Button title="Keep my account" secondary disabled={busy} onPress={close} /></>}
      {!!panel && !!error && <ErrorBox message={error} />}
    </Sheet>
  </SafeAreaView>;
}

function DeveloperCredit() {
  return <View style={[styles.card, { backgroundColor: colors.lavender, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18 }]}>
    <View style={{ width: 43, height: 43, borderRadius: 15, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="code-slash-outline" size={22} color={colors.purple} /></View>
    <View style={{ flex: 1, gap: 5 }}><Text style={styles.overline}>DEVELOPER</Text><Text selectable style={[styles.cardTitle, { fontSize: 16 }]}>{appInfo.developerName}</Text></View>
  </View>;
}
function Group({ title, children }: { title: string; children: ReactNode }) { return <View style={{ gap: 11 }}><Text style={styles.overline}>{title}</Text><View style={[styles.card, { paddingHorizontal: 18, paddingVertical: 1, gap: 0 }]}>{children}</View></View>; }
function ProfileRow({ icon, title, detail, onPress, disabled, destructive = false, last = false }: { icon: IconName; title: string; detail: string; onPress: () => void; disabled: boolean; destructive?: boolean; last?: boolean }) {
  const ink = destructive ? colors.red : colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [profile.row, !last && { borderBottomWidth: 1, borderColor: colors.border }, (pressed || disabled) && { opacity: .55 }]}><View style={[profile.rowIcon, { backgroundColor: destructive ? colors.redSoft : colors.surface }]}><Ionicons name={icon} size={20} color={destructive ? colors.red : colors.green} /></View><View style={{ flex: 1, gap: 5 }}><Text style={[profile.rowTitle, { color: ink }]}>{title}</Text><Text style={styles.small}>{detail}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.muted} /></Pressable>;
}
function Info({ title, text }: { title: string; text: string }) { return <View style={{ gap: 8 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.subtitle}>{text}</Text></View>; }
const profile = StyleSheet.create({
  hero: { backgroundColor: colors.forest, borderRadius: 28, padding: 24, gap: 20 },
  avatar: { height: 64, width: 64, borderRadius: 23, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.extra, fontSize: 24, color: colors.forest },
  member: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, paddingLeft: 12 },
  memberText: { fontFamily: fonts.medium, fontSize: 10, color: colors.onDark, flexShrink: 1 },
  name: { fontFamily: fonts.extra, fontSize: 26, color: colors.white, letterSpacing: -.8 },
  email: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.onDark },
  edit: { flexDirection: 'row', alignItems: 'center', minHeight: 46, gap: 9, borderTopWidth: 1, borderTopColor: '#FFFFFF20', paddingTop: 17 },
  editText: { fontFamily: fonts.bold, color: colors.lime, fontSize: 12, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 18, minHeight: 80 },
  rowIcon: { width: 41, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 19 },
});
