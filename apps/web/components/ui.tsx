'use client';
import { useEffect, useRef } from 'react';
import { X, ArrowUpRight, Plus, RefreshCw } from 'lucide-react';
import { money } from '@/lib/api';
export function Empty({title,description,action,onAction}: {title:string;description:string;action?:string;onAction?:()=>void}) {return <div className="empty"><div className="empty-symbol"><ArrowUpRight size={25}/></div><h3>{title}</h3><p>{description}</p>{action&&<button className="button secondary small" onClick={onAction}><Plus size={16}/>{action}</button>}</div>;}
export function ErrorState({message,retry}:{message:string;retry:()=>void}) {return <div className="error-state" role="alert"><h3>Let’s reconnect.</h3><p>{message}</p><button className="button secondary" onClick={retry}><RefreshCw size={16}/>Try again</button></div>;}
export function Loading() {return <div className="loading" aria-label="Loading your finances" role="status"><div className="skeleton title-skeleton"/><div className="stats-grid">{[1,2,3].map(x=><div key={x} className="skeleton card-skeleton"/>)}</div><div className="skeleton chart-skeleton"/><span className="muted">Bringing your finances together. A sleeping backend may take a moment.</span></div>;}
export function Progress({value,color}: {value:number;color?:string}) {return <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,value/100))}><span style={{width:`${Math.min(100,Math.max(0,value/100))}%`,background:color}}/></div>;}
export function Modal({title,children,close}:{title:string;children:React.ReactNode;close:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();return()=>{el?.close();};},[]);
  return <dialog ref={ref} className="modal" onCancel={close} onClick={e=>{if(e.target===ref.current)close();}}><div className="modal-head"><div><span className="eyebrow">A LITTLE MORE CLARITY</span><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={20}/></button></div>{children}</dialog>;
}
export function Trend({points}:{points:{date:string;amount:number}[]}) {
  const max=Math.max(1,...points.map(x=>x.amount));
  return <div className="trend-chart"><div className="chart-y">{[1,.75,.5,.25,0].map(x=><span key={x}>{money(Math.round(max*x))}</span>)}</div><div className="chart-plot"><div className="chart-grid"/>{points.map(point=><div key={point.date} className="bar-column"><div className="bar-hover">{new Date(point.date+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})}<strong>{money(point.amount)}</strong></div><div className="bar" style={{height:`${Math.max(0,point.amount)/max*90}%`}}/><span>{new Date(point.date+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div>)}</div></div>;
}
