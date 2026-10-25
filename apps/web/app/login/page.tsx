'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowUpRight, ArrowRight, ShieldCheck, Sparkles, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { EmailAuthPanel } from '@/components/email-auth-panel';
import { isEmailChallenge, type EmailChallenge, type EmailPurpose } from '../../../../packages/contracts/email-auth';

const schema = z.object({email:z.email('Enter a valid email.'), password:z.string().min(12, 'Use at least 12 characters.').max(128), name:z.string().max(80).optional()});
type Values = z.infer<typeof schema>;
export default function Login() {
  const [signup, setSignup] = useState(false), [visible, setVisible] = useState(false), [error,setError]=useState('');
  const [mailFlow,setMailFlow]=useState<{purpose:EmailPurpose;email:string;challenge?:EmailChallenge}|null>(null);
  const router=useRouter(), cache=useQueryClient();
  const {register,handleSubmit,formState:{errors,isSubmitting},reset,getValues,setValue}=useForm<Values>({resolver:zodResolver(schema)});
  const submit=handleSubmit(async values=>{
    setError('');
    try { const result=await api<unknown>(`auth/${signup?'register':'login'}`,{method:'POST',body:JSON.stringify(signup?{...values,name:values.name||'Friend'}:{email:values.email,password:values.password})}); if(isEmailChallenge(result)){setValue('password','');setMailFlow({purpose:result.purpose,email:values.email,challenge:result});return;} cache.clear(); router.replace('/'); }
    catch(e){setError((e as Error).message);}
  });
  if(mailFlow)return <EmailAuthPanel purpose={mailFlow.purpose} initialEmail={mailFlow.email} initialChallenge={mailFlow.challenge} onBack={()=>{setMailFlow(null);setSignup(false);setError('');setValue('password','');}}/>;
  return <main className="auth-page"><div className="auth-story"><Link className="brand" href="/login"><span className="brand-mark"><ArrowUpRight size={24}/></span>morrow<span>mint</span><small>FINANCE, WITH CLARITY.</small></Link><div className="story-copy"><div className="eyebrow"><span className="live-dot"/> A LITTLE CLARITY. A LOT OF POSSIBILITY.</div><h1>Make room for<br/>what <em>matters.</em></h1><p>Your everyday money, your bigger plans, and a clearer path between the two.</p><div className="story-visual"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-center"><Sparkles size={48}/></div><span className="visual-note note-one">Every rupee, understood.</span><span className="visual-note note-two">Your future, a little closer. <ArrowUpRight size={16}/></span></div></div><div className="auth-foot"><ShieldCheck size={17}/> Your financial records stay in your account.</div></div><div className="auth-form"><div className="auth-form-inner"><span className="pill"><Sparkles size={14}/> YOUR MONEY, IN PERSPECTIVE</span><h2>{signup?'A fresh start for your finances.':'Good to have you back.'}</h2><p>{signup?'Create your account. Start with what you have.':'Sign in and pick up where you left off.'}</p><form onSubmit={submit}>{signup&&<label>Your name<input {...register('name')} required maxLength={80} autoComplete="name" placeholder="What should we call you?"/></label>}<label>Email address<input {...register('email')} type="email" autoComplete="email" placeholder="you@example.com"/>{errors.email&&<span className="field-error">{errors.email.message}</span>}</label><label>Password<div className="password-wrap"><input {...register('password')} type={visible?'text':'password'} autoComplete={signup?'new-password':'current-password'} placeholder="At least 12 characters"/><button type="button" className="icon-button" aria-label={visible?'Hide password':'Show password'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{errors.password&&<span className="field-error">{errors.password.message}</span>}</label>{error&&<div role="alert" className="error-box">{error}</div>}<button className="button primary" disabled={isSubmitting}>{isSubmitting?'Connecting…':signup?'Create your account':'Sign in'}<ArrowRight size={18}/></button></form>{!signup&&<div style={{display:"grid",gap:12,marginTop:16}}><button type="button" className="button secondary" disabled={isSubmitting} onClick={()=>setMailFlow({purpose:"email_login",email:getValues("email")||""})}>Sign in with an email code</button><button type="button" className="auth-switch" disabled={isSubmitting} onClick={()=>setMailFlow({purpose:"password_reset",email:getValues("email")||""})}>Forgot password?</button></div>}<p className="auth-switch">{signup?'Already have an account?':'New to Morrowmint?'} <button onClick={()=>{setSignup(!signup);setError('');reset();}}>{signup?'Sign in':'Create an account'}</button></p><div className="privacy-note"><ShieldCheck size={17}/><span>Passwords are securely hashed. AI sharing is optional and off by default.</span></div></div></div></main>;
}
