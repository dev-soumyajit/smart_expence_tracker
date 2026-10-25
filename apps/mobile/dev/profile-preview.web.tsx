import { useState } from 'react';
import { Text, View } from 'react-native';
import { ProfilePage, type ProfileActions } from '../components/profile-page';
import { FloatingNavigation } from '../components/navigation';
import { Button, colors, fonts, styles } from '../components/ui';
import { user } from './fixtures';

export default function ProfilePreview({ onNavigate, onEmpty, onRestore, mode }: { onNavigate: (path: string) => void; onEmpty: () => void; onRestore: () => void; mode?: string }) {
  const [example, setExample] = useState(user), [lastAction, setLastAction] = useState('');
  const actions: ProfileActions = {
    savePreferences: async preferences => { if (mode === 'failure') throw new Error('Example server unavailable. Your edits are still here.'); setExample(previous => ({ ...previous, ...preferences })); },
    exportData: async () => { setLastAction('Example export requested. No data was downloaded or shared.'); },
    signOut: async () => { if (mode === 'failure') throw new Error('Example sign-out failed. You are still signed in.'); onNavigate('login'); },
    deleteAccount: async password => { if (password === 'wrong') throw new Error('Example password rejected. Check your password and try again.'); onNavigate('login'); },
    forgetSmsChoices: async () => setLastAction('Example learned choices cleared.'),
    managePermissions: async () => setLastAction('Example device settings requested.'),
    navigate: onNavigate,
  };
  return <View style={{ flex: 1, backgroundColor: colors.bg }}><View style={{ backgroundColor: '#E9EEDC', paddingVertical: 5, alignItems: 'center' }}><Text style={{ fontFamily: fonts.semibold, fontSize: 8, letterSpacing: 1, color: '#7C8E62' }}>DESIGN PREVIEW · EXAMPLE DATA · NO ACCOUNT CHANGES</Text></View>
    <ProfilePage user={example} smsStatus="Paste mode on this build" actions={actions}>
      <View style={{ gap: 12 }}><Text style={styles.overline}>DEVELOPMENT GALLERY</Text>{!!lastAction && <Text style={styles.text}>{lastAction}</Text>}<Button title="Preview sign-in screen" onPress={() => onNavigate('login')} secondary /><Button title="Preview empty state" secondary onPress={onEmpty} /><Button title="Restore example overview" secondary onPress={onRestore} /></View>
    </ProfilePage><FloatingNavigation active="settings" onSelect={onNavigate} onAdd={() => onNavigate('entry')} />
  </View>;
}
