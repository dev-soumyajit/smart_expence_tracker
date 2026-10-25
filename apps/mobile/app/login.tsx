import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Path } from 'react-native-svg';
import { passwordMaxLength, passwordMinLength } from '../../../packages/contracts/validation';
import { api, storeSession, type Tokens } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Brand, Button, colors, ErrorBox, Field, fonts, styles } from '../components/ui';

const schema = z.object({ email: z.email('A valid email gets you where you need to go.'), password: z.string().min(passwordMinLength, 'Use at least 12 characters.').max(passwordMaxLength), name: z.string().max(80).optional() });
type Values = z.infer<typeof schema>;
export function WelcomeArt() {
  return <View style={login.art} pointerEvents="none"><Svg width="190" height="190" viewBox="0 0 190 190"><Circle cx="95" cy="95" r="84" stroke="#DDE5D2" strokeDasharray="3 7" fill="none" /><Circle cx="95" cy="95" r="61" fill="#E7EECF" /><Path d="M95 95C27 99 17 41 52 33C86 25 103 55 95 95ZM95 95C91 27 149 17 157 52C165 86 135 103 95 95ZM95 95C163 91 173 149 138 157C104 165 87 135 95 95ZM95 95C99 163 41 173 33 138C25 104 55 87 95 95Z" fill="#234F3B" /><Circle cx="95" cy="95" r="15" fill={colors.lime} /></Svg><View style={[login.artLabel, { left: 2, top: 31, transform: [{ rotate: '-7deg' }] }]}><Ionicons name="leaf-outline" size={16} color={colors.green} /><Text style={login.artLabelText}>Grow a little.</Text></View><View style={[login.artLabel, { right: 0, bottom: 31, transform: [{ rotate: '6deg' }], backgroundColor: colors.lavender }]}><Ionicons name="sparkles-outline" size={15} color={colors.purple} /><Text style={login.artLabelText}>Breathe a little.</Text></View></View>;
}
export default function Login() {
  const [signup, setSignup] = useState(false), [visible, setVisible] = useState(false), [error, setError] = useState('');
  const auth = useAuth();
  const { control, handleSubmit, clearErrors, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', name: '' } });
  if (auth.signedIn) return <Redirect href="/" />;
  const submit = handleSubmit(async values => {
    setError('');
    try { const tokens = await api<Tokens>('auth/' + (signup ? 'register' : 'login'), { method: 'POST', body: JSON.stringify(signup ? { ...values, name: values.name?.trim() || 'Friend' } : { email: values.email, password: values.password }) }); await storeSession(tokens); auth.setSignedIn(true); }
    catch (problem) { setError((problem as Error).message); }
  });
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={login.page}>
    <View style={{ alignItems: 'center', paddingTop: 5 }}><Brand /></View>
    <View style={{ alignItems: 'center', gap: 12, marginTop: 25 }}><View style={login.promise}><View style={{ width: 5, height: 5, borderRadius: 4, backgroundColor: '#83A34B' }} /><Text style={{ fontFamily: fonts.bold, fontSize: 8, letterSpacing: 1.8, color: '#7A8B60' }}>MAKE ROOM FOR TOMORROW</Text></View><Text style={login.headline}>Small habits.{'\n'}<Text style={{ color: '#729251' }}>Brighter tomorrows.</Text></Text><Text style={[styles.subtitle, { textAlign: 'center', maxWidth: 280 }]}>A calmer relationship with your money,{"\n"}one everyday decision at a time.</Text></View>
    {!signup && <WelcomeArt />}
    <View style={login.form}><View style={{ gap: 6, marginBottom: 3 }}><View style={styles.row}><Text style={[styles.title, { fontSize: 23, lineHeight: 31, flex: 1 }]}>{signup ? 'Your next chapter starts here.' : 'Welcome back, you.'}</Text><Pressable accessibilityRole="button" accessibilityLabel={signup?'Return to sign in':'Create an account'} onPress={()=>{setSignup(!signup);setError('');clearErrors();}} style={{minHeight:44,justifyContent:'center'}}><Text style={[styles.link,{fontSize:10}]}>{signup?'Sign in':'Join us ↗'}</Text></Pressable></View><Text style={styles.small}>{signup ? 'A few details, then a fresh perspective.' : 'Pick up where your money story left off.'}</Text></View>
      {signup && <Controller control={control} name="name" render={({ field: { value, onChange, onBlur } }) => <Field label="What should we call you?" icon="person-outline" value={value} onChangeText={onChange} onBlur={onBlur} autoComplete="name" placeholder="Your name" maxLength={80} />} />}
      <Controller control={control} name="email" render={({ field: { value, onChange, onBlur } }) => <Field label="Email address" icon="mail-outline" value={value} onChangeText={onChange} onBlur={onBlur} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" error={errors.email?.message} />} />
      <Controller control={control} name="password" render={({ field: { value, onChange, onBlur } }) => <Field label="Password" icon="lock-closed-outline" value={value} onChangeText={onChange} onBlur={onBlur} secureTextEntry={!visible} autoCapitalize="none" autoComplete={signup ? 'new-password' : 'current-password'} placeholder="At least 12 characters" error={errors.password?.message} right={<Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} /></Pressable>} />} />
      {!!error && <ErrorBox message={error} />}<Button title={signup ? 'Create my account' : 'Let’s get you in'} icon="arrow-forward" busy={isSubmitting} onPress={() => void submit()} />
      <Pressable accessibilityRole="button" onPress={() => { setSignup(!signup); setError(''); clearErrors(); }} style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}><Text style={styles.small}>{signup ? 'Already making moves? ' : 'A new beginning? '}<Text style={{ fontFamily: fonts.bold, color: colors.green }}>{signup ? 'Sign in' : 'Join Morrowmint'}</Text></Text></Pressable>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 2 }}><Ionicons name="shield-checkmark-outline" color="#8B9D76" size={13} /><Text style={[styles.small, { fontSize: 9 }]}>Your money is personal. Your space stays yours.</Text></View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const login = StyleSheet.create({
  page: { paddingHorizontal: 23, paddingTop: 23, paddingBottom: 30, flexGrow: 1, width: '100%', maxWidth: 500, alignSelf: 'center', gap: 17 },
  headline: { fontFamily: fonts.extra, fontSize: 32, letterSpacing: -1.6, lineHeight: 41, textAlign: 'center', color: colors.text },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF0DC', paddingVertical: 8, paddingHorizontal: 11, borderRadius: 20 },
  art: { height: 179, width: 286, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: -5 },
  artLabel: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: colors.panel, borderRadius: 13, shadowColor: '#2E4A2F', shadowOpacity: .07, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  artLabelText: { fontFamily: fonts.bold, color: colors.text, fontSize: 10 },
  form: { backgroundColor: colors.panel, borderRadius: 28, padding: 21, gap: 19 },
});
