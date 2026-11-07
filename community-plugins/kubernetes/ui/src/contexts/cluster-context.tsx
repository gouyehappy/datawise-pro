/* DataWise host owns cluster identity; the plugin never discovers or selects clusters itself. */
import React, { createContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Cluster } from '@/types/api'
import { getHostBridge } from '@/lib/host-bridge'

interface ClusterContextType { clusters: Cluster[]; currentCluster: string|null; setCurrentCluster:(id:string)=>void; isLoading:boolean; isSwitching:boolean; error:Error|null }
export const ClusterContext=createContext<ClusterContextType|undefined>(undefined)
type Ctx={connectionId?:string;connectionName?:string;connection?:{id?:string;name?:string}}
type Bridge={ready:Promise<void>;context?:Ctx;onContext?:(fn:(c:Ctx)=>void)=>()=>void;reopenConnection?:(id:string)=>Promise<unknown>}
const getBridge=()=> getHostBridge() as Bridge | undefined
const normalize=(c:Ctx|undefined|null):Ctx=>{
  const ctx=c||{}
  const connectionId=ctx.connectionId||ctx.connection?.id||''
  const connectionName=ctx.connectionName||ctx.connection?.name||''
  return connectionId?{...ctx,connectionId,connectionName:connectionName||connectionId}:ctx
}
const clusterFrom=(c:Ctx):Cluster|null=>c.connectionId?({id:0,name:c.connectionName||c.connectionId,enabled:true,inCluster:false,isDefault:true,createdAt:'',updatedAt:''}):null
export const ClusterProvider:React.FC<{children:React.ReactNode}>=({children})=>{
 const qc=useQueryClient(); const [ctx,setCtx]=useState<Ctx>({}); const [loading,setLoading]=useState(true); const [error,setError]=useState<Error|null>(null)
 useEffect(()=>{const b=getBridge(); if(!b){setLoading(false);setError(new Error('DataWise Host Bridge unavailable'));return} let alive=true; const apply=(c:Ctx)=>{if(!alive)return; setCtx(normalize(c)); setLoading(false)}; const off=b.onContext?.(apply); b.ready.then(()=>{apply(b.context||{}); const id=normalize(b.context||{}).connectionId; if(id&&typeof b.reopenConnection==='function'){void b.reopenConnection(id).catch(()=>{ /* host may already hold the session */ })}}).catch(e=>{if(alive){setError(e instanceof Error?e:new Error(String(e)));setLoading(false)}}); return()=>{alive=false;off?.()}},[])
 const id=ctx.connectionId||null; useEffect(()=>{void qc.cancelQueries(); qc.clear()},[id,qc])
 const cluster=clusterFrom(ctx)
 return <ClusterContext.Provider value={{clusters:cluster?[cluster]:[],currentCluster:id,setCurrentCluster:()=>undefined,isLoading:loading,isSwitching:false,error}}>{children}</ClusterContext.Provider>
}
