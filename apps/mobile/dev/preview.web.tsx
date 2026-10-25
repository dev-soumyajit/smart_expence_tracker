import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { HomeContent } from '../components/screen';
import { AppHeader, BudgetCard, InsightCard, TransactionRows, WalletCard } from '../components/finance-cards';
import { FloatingNavigation } from '../components/navigation';
import { TransactionEntry, type EntryKind, type EntryPayload } from '../components/entry-form';
import { Button, colors, fonts, SectionHeading, Sheet, styles } from '../components/ui';
import Login from '../app/login';
import SmsPreview from './sms-preview.web';
import ProfilePreview from './profile-preview.web';
import EmailPreview from './email-preview.web';
import { accounts, budgets, categories, dashboard, transactions, user } from './fixtures';

export default function Preview() {
  const params = useLocalSearchParams<{ screen?: string; smsCase?: string; profileCase?: string; emailCase?: string }>();
  const [screen, setScreen] = useState(params.screen || 'index'), [hidden, setHidden] = useState(false), [entryKind, setEntryKind] = useState<EntryKind>('expense');
  const [sheet, setSheet] = useState(false), [result, setResult] = useState(''), [chartEmpty, setChartEmpty] = useState(false);
  const scroll=useRef<ScrollView>(null);
  useEffect(()=>{ if (params.screen) setScreen(params.screen); },[params.screen]);
  useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false});},[screen]);
  const add = (kind: string) => { setEntryKind(kind === 'income' || kind === 'transfer' ? kind : 'expense'); setScreen('entry'); };
  const route = (section: string) => setScreen(section === 'home' ? 'index' : section);
  const show = (message: string) => { setResult(message); setSheet(true); };
  const save = async (payload: EntryPayload) => { show('Preview received ' + payload.amount + ' paise as ' + payload.kind + '. Example data only; nothing was saved.'); };
  if (screen === 'login') return <Login />;
  if (screen === 'sms') return <SmsPreview mode={params.smsCase} onClose={() => setScreen('index')} />;
  if (screen === 'email') return <EmailPreview mode={params.emailCase} onBack={() => setScreen('login')} />;
  if (screen === 'settings') return <ProfilePreview onNavigate={route} mode={params.profileCase} onEmpty={() => { setChartEmpty(true); setScreen('index'); }} onRestore={() => { setChartEmpty(false); setScreen('index'); }} />;
  if (screen === 'entry') return <><TransactionEntry accounts={accounts} categories={categories} initialKind={entryKind} onSave={save} onClose={() => setScreen('index')} /><Sheet visible={sheet} title="Development preview" onClose={() => setSheet(false)}><Text style={styles.text}>{result}</Text></Sheet></>;
  const example = chartEmpty ? { ...dashboard, accounts: [], categories: [], goals: [], available: 0, income: 0, expenses: 0, savings: 0, safe_to_spend: 0, daily_safe: 0 } : dashboard;
  return <SafeAreaView style={styles.safe}><View style={{ backgroundColor: '#E9EEDC', paddingVertical: 5, alignItems: 'center' }}><Text style={{ fontFamily: fonts.semibold, fontSize: 8, letterSpacing: 1, color: '#7C8E62' }}>DESIGN PREVIEW · EXAMPLE DATA · NO FINANCIAL WRITES</Text></View><ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <AppHeader name={user.name} onProfile={() => setScreen('settings')} onReminders={() => show('Scheduled reminders appear here. This is example data.')} dueCount={1} />
    <View style={{ gap: 7 }}><Text style={styles.subtitle}>{screen === 'index' ? 'Hello, Alex 👋' : screen === 'accounts' ? 'Your wallets' : screen === 'budgets' ? 'Your spending plan' : screen === 'settings' ? 'Your space' : 'Your activity'}</Text><Text style={styles.title}>{screen === 'index' ? 'Make room for more.' : screen === 'accounts' ? 'All together now.' : screen === 'budgets' ? 'A plan that fits.' : screen === 'settings' ? 'Make it yours.' : 'Every little detail.'}</Text></View>
    {screen === 'index' && <HomeContent data={example} recent={chartEmpty ? [] : transactions} categories={categories} hidden={hidden} toggleHidden={() => setHidden(!hidden)} period="Current cycle" actions={{ add, route, safe: () => show(dashboard.assumptions), period: () => show('The real app loads a selected period from the authenticated API.'), goal: goal => show(goal.name + ': a little closer every month.'), transaction: transaction => show(transaction.description) }} />}
    {screen === 'accounts' && <>{accounts.map(account => <WalletCard key={account.id} account={account} onPress={() => show(account.name)} />)}<InsightCard title="From bank to pocket. Still your money." detail="ATM withdrawals are transfers. Cash purchases are expenses. Every rupee stays in its right place." /><Button title="Add a wallet" onPress={() => show('Wallet creation uses the real authenticated API in the app.')} secondary /></>}
    {screen === 'budgets' && <><View style={[styles.card, { backgroundColor: colors.limeSoft }]}><Text style={[styles.title, { fontSize: 25 }]}>A little structure.{'\n'}A little more freedom.</Text><Text style={styles.subtitle}>Make room for the things you need and the things you love.</Text></View><SectionHeading title="Your budgets" action="New budget +" onPress={() => show('The app creates budgets through the authenticated API.')} />{budgets.map(budget => <BudgetCard key={budget.id} budget={budget} category={categories.find(item => item.id === budget.category_id)} />)}</>}
    {screen === 'transactions' && <><View style={[styles.card, { backgroundColor: colors.forest }]}><Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.onDark }}>Current-cycle net spending</Text><Text style={[styles.amount, { color: colors.white }]}>₹21,234.50</Text><Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.onDark }}>1 Oct – 31 Oct · transfers excluded</Text></View><View style={[styles.card, { paddingVertical: 4 }]}><TransactionRows rows={transactions} accounts={accounts} categories={categories} onSelect={row => show(row.description)} /></View></>}
    <Pressable accessibilityRole="button" onPress={() => setScreen('login')}><Text style={[styles.small, { textAlign: 'center', padding: 15 }]}>Development-only screen gallery · Sign-in preview</Text></Pressable>
  </ScrollView><FloatingNavigation active={screen} onSelect={setScreen} onAdd={() => add('expense')} /><Sheet visible={sheet} title="Development preview" onClose={() => setSheet(false)}><Text style={styles.subtitle}>{result}</Text><Text style={styles.small}>The actual app uses authenticated financial records. This gallery contains examples only.</Text></Sheet></SafeAreaView>;
}
