import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, PermissionsAndroid, Platform, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '../../web/lib/types';
import { ProfilePage, type ProfileActions } from './profile-page';
import { Button, colors, EmptyState, styles } from './ui';
import { api, clearSession } from '../lib/api';
import { useAuth } from '../lib/auth';
import { canReadSms, clearLearning } from '../lib/sms-device';
import { clearProfileExports, exportProfileData } from '../lib/profile-export';

export default function ProfileScreen() {
  const auth = useAuth(), router = useRouter(), cache = useQueryClient();
  const user = useQuery({ queryKey: ['me'], queryFn: () => api<User>('auth/me'), enabled: auth.signedIn });
  const [smsStatus, setSmsStatus] = useState('Checking access…');
  useEffect(() => {
    let live = true;
    const check = async () => {
      if (Platform.OS !== 'android' || !canReadSms) { if (live) setSmsStatus('Paste mode on this build'); return; }
      try { const allowed = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS); if (live) setSmsStatus(allowed ? 'Inbox access allowed' : 'Permission off'); }
      catch { if (live) setSmsStatus('Check device settings'); }
    };
    void check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { live = false; subscription.remove(); };
  }, []);
  if (auth.ready && !auth.signedIn) return <Redirect href="/login" />;
  if (!auth.ready || user.isPending) return <SafeAreaView style={styles.safe}><View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Loading your profile" color={colors.green} /></View></SafeAreaView>;
  if (!user.data) return <SafeAreaView style={styles.safe}><View style={styles.content}><EmptyState title="Let's reconnect." detail={user.error?.message || 'Your profile could not be loaded.'} icon="cloud-offline-outline" /><Button title="Retry profile" onPress={() => void user.refetch()} /></View></SafeAreaView>;
  const profile = user.data;
  const finishSession = async () => {
    try { await clearProfileExports(profile.id); } catch { /* Local cache cleanup must not prevent signing out. */ }
    try { await clearSession(); }
    finally { cache.clear(); auth.setSignedIn(false); router.replace('/login'); }
  };
  const actions: ProfileActions = {
    savePreferences: async preferences => { await cache.cancelQueries({ queryKey: ['me'] }); const saved = await api<User>('settings', { method: 'PATCH', body: JSON.stringify(preferences) }); cache.setQueryData(['me'], saved); void cache.invalidateQueries({ queryKey: ['dashboard'] }); },
    exportData: () => exportProfileData(profile.id),
    signOut: async () => { await api('auth/logout', { method: 'POST' }); await finishSession(); },
    deleteAccount: async password => {
      await api('settings/account', { method: 'DELETE', body: JSON.stringify({ email: profile.email, password }) });
      try { await clearLearning(profile.id); } catch { /* Server deletion succeeded; still end the session. */ }
      await finishSession();
    },
    forgetSmsChoices: () => clearLearning(profile.id),
    managePermissions: () => Linking.openSettings(),
    navigate: path => { if (path === 'home') router.navigate('/'); else router.push(('/' + path) as '/accounts'); },
  };
  return <ProfilePage user={profile} smsStatus={smsStatus} actions={actions} refreshing={user.isRefetching} onRefresh={() => void user.refetch()} refreshError={user.isRefetchError ? 'Your profile could not refresh. Pull down to try again.' : undefined} />;
}
