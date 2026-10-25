import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { DeviceSms, SmsLearning, SmsLearningContext, SmsSuggestion } from '../../../packages/contracts/sms';

type InboxPage = { messages: DeviceSms[]; scanned: number; hasMore: boolean; beforeDate: number; beforeId: string };
const native = Platform.OS === 'android' ? requireOptionalNativeModule<{ readInbox(since: number, until: number, beforeDate: number, beforeId: string): Promise<InboxPage> }>('MorrowmintSms') : null;
export const canReadSms = !!native;
export const smsUnavailable = Platform.OS === 'android' ? 'Phone reading needs the Morrowmint Android build. You can paste a bank message below.' : 'Inbox reading is available on Android. You can paste a bank message below.';
export async function requestSmsAccess() {
  if (!native) throw new Error(smsUnavailable);
  if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)) return;
  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (status !== PermissionsAndroid.RESULTS.GRANTED) throw new Error(status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'SMS access is blocked. Open Android app settings to enable it, or paste a message.' : 'SMS access was not granted. You can still paste a message.');
}
export async function readSmsPage(since: number, until: number, beforeDate = 0, beforeId = '') {
  if (!native) throw new Error(smsUnavailable);
  return native.readInbox(since, until, beforeDate, beforeId);
}
export const fingerprintSms = (suggestion: SmsSuggestion) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, suggestion.identity);
const scoped = (user: string, key: string) => 'mm_sms_' + user + '_' + key;
export async function loadLearning(user: string): Promise<SmsLearning> {
  if (Platform.OS === 'web') return { wallets: {}, categories: {} };
  const read = async (key: string) => {
    const raw = await SecureStore.getItemAsync(scoped(user, key));
    if (!raw) return {};
    try {
      const value = JSON.parse(raw);
      return Object.fromEntries(Object.entries(value).filter(([key, id]) => key.length <= 64 && typeof id === 'string' && id.length === 36).slice(-8)) as Record<string, string>;
    } catch { return {}; }
  };
  return { wallets: await read('wallets'), categories: await read('categories') };
}
export async function storeLearning(user: string, rules: SmsLearning) {
  if (Platform.OS === 'web') return;
  for (const [key, value] of Object.entries(rules)) await SecureStore.setItemAsync(scoped(user, key), JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function clearLearning(user: string) {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(scoped(user, 'wallets'));
  await SecureStore.deleteItemAsync(scoped(user, 'categories'));
}
export async function dismissed(user: string, fingerprint: string) {
  return Platform.OS !== 'web' && await SecureStore.getItemAsync(scoped(user, fingerprint)) === 'dismissed';
}
export async function dismissSms(user: string, fingerprint: string) {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(scoped(user, fingerprint), 'dismissed');
}
export async function undoDismissSms(user: string, fingerprint: string) {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(scoped(user, fingerprint));
}
export async function storeLearningContext(user: string, fingerprint: string, context: SmsLearningContext) {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(scoped(user, 'context_' + fingerprint), JSON.stringify(context), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function loadLearningContext(user: string, fingerprint: string): Promise<SmsLearningContext | undefined> {
  if (Platform.OS === 'web') return;
  const raw = await SecureStore.getItemAsync(scoped(user, 'context_' + fingerprint));
  if (!raw) return;
  try { const context = JSON.parse(raw); if (typeof context.walletKey === 'string' && context.walletKey.length <= 64 && typeof context.merchantKey === 'string' && context.merchantKey.length <= 64) return context; } catch { /* Ignore damaged optional preferences. */ }
}
