'use strict';
(() => {
  const bindingKey = 'scadenze-sync-binding-v1';
  const sessionKey = 'scadenze-sync-session-v1';
  const baselineKey = 'scadenze-sync-baseline-v1';
  const fields={
    accounts:['id','name','bankName','initialBalance'],
    expenses:['id','title','amount','date','accountId','category','notes'],
    incomes:['id','title','amount','date','accountId','category','notes'],
    deadlines:['id','title','amount','dueDate','accountId','category','recurrence','paid']
  };
  const kinds=Object.keys(fields);
  const get=id=>document.getElementById(id);
  const loadLocal=name=>{
    try{return JSON.parse(localStorage.getItem(name));}
    catch{return null;}
  };
  const persist=(name,value)=>localStorage.setItem(name,JSON.stringify(value));
  const validId=value=>typeof value==='string' && /^[a-zA-Z0-9_.-]{1,180}$/.test(value) && value!=='all';
  const validDate=value=>{
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+'T12:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value;
  };
  const validField=(name,value)=>{
    if(name==='id')return validId(value);
    if(name==='accountId')return value==null || value==='' || validId(value);
    if(name==='date'||name==='dueDate')return validDate(value);
    if(name==='amount'||name==='initialBalance')return Number.isFinite(value) && Math.abs(value)<=1e12;
    if(name==='paid')return typeof value==='boolean';
    return typeof value==='string' && value.length<=10000;
  };
  function canonical(record){
    if(!record || typeof record!=='object')throw new Error('Archivio non valido.');
    return Object.fromEntries(kinds.map(kind=>{
      if(!Array.isArray(record[kind]))throw new Error('Archivio non valido.');
      const ids=new Set();
      const normalized=record[kind].map(item=>{
        if(!item || ids.has(item.id))throw new Error('Dati duplicati o non validi.');
        ids.add(item.id);
        const values=fields[kind].map(name=>{
          const fallback={
            bankName:'',initialBalance:0,accountId:null,category:'Altro',notes:'',
            recurrence:'Nessuna',paid:false
          };
          const value=item[name]??fallback[name];
          if(!validField(name,value))throw new Error('Archivio non valido.');
          return [name,name==='accountId' && value===''?null:value];
        });
        return Object.fromEntries(values);
      });
      return [kind,normalized.sort((a,b)=>a.id.localeCompare(b.id))];
    }));
  }
  window.normalizeScadenze=canonical;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

  function reconcile(base,local,remote,choice){
    let conflicts=0;
    function pick(previous,a,b){
      if(equal(a,b))return a;
      if(equal(a,previous))return b;
      if(equal(b,previous))return a;
      conflicts++;
      return choice==='remote'?b:a;
    }
    const merged=Object.fromEntries(kinds.map(kind=>{
      const maps=[base,local,remote].map(record=>new Map(record[kind].map(item=>[item.id,item])));
      const ids=new Set(maps.flatMap(map=>[...map.keys()]));
      return [kind,[...ids].map(id=>pick(...maps.map(map=>map.get(id)))).filter(Boolean)];
    }));
    return {record:canonical(merged),conflicts};
  }
  function backupBeforeChoice(){
    const url=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));
    const a=document.createElement('a');
    a.href=url;
    a.download='ScadenzeAI-prima-del-conflitto.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  let binding=loadLocal(bindingKey);
  let session=loadLocal(sessionKey);
  let running=false;
  let timer;
  let conflict=false;
  const login=get('sync-login');
  const updateStatus=message=>{get('sync-status').textContent=message;};
  const options=()=> {
    get('sync-login').hidden=Boolean(session);
    get('sync-controls').hidden=!session;
    get('sync-conflict').hidden=!conflict;
    get('sync-now').disabled=running;
    get('sync-logout').disabled=running;
    login.elements.project.readOnly=Boolean(binding);
    login.elements.publishable.readOnly=Boolean(binding);
    login.elements.email.readOnly=Boolean(binding);
    if (binding && !session) {
      login.elements.project.value=binding.project;
      login.elements.publishable.value=binding.publishable;
      login.elements.email.value=binding.email;
    }
  };
  function schedule(delay=500) {
    clearTimeout(timer);
    if (session && !conflict) timer=setTimeout(()=>sync(),delay);
  }
  async function request(config,path,{method='GET',accessToken,body,headers={}}={}) {
    const response=await fetch(config.project+path,{
      method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),
      headers:{apikey:config.publishable, ...(accessToken?{Authorization:'Bearer '+accessToken}:{}),
        ...(body?{'Content-Type':'application/json'}:{}),...headers},
      body:body?JSON.stringify(body):undefined
    });
    const payload=await response.json().catch(()=>null);
    if (!response.ok) {
      const error=new Error('Richiesta non riuscita.');
      error.status=response.status;
      throw error;
    }
    return payload;
  }
  async function access() {
    if (session.expires_at>Date.now()/1000+60) return session.access_token;
    try {
      const fresh=await request(binding,'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',body:{refresh_token:session.refresh_token}
      });
      if (fresh.user?.id!==binding.uid) throw new Error('Account inatteso.');
      persist(sessionKey,fresh);
      session=fresh;
      return fresh.access_token;
    } catch (error) {
      if ([400,401,403].includes(error.status)) {
        localStorage.removeItem(sessionKey);
        session=null;
        options();
      }
      throw error;
    }
  }

  function applyRemote(record) {
    if(equal(canonical(db),record))return;
    const prior=db;
    db=record;
    if(state.account!=='all'&&!db.accounts.some(account=>account.id===state.account))state.account='all';
    try{save(false);}catch(error){db=prior;throw error;}
  }

  async function sync(choice) {
    if (!session || running || (conflict && !choice)) return;
    if (get('modal').open || document.hidden) {schedule(15000);return;}
    running=true;
    options();
    try {
      const token=await access();
      const path='/rest/v1/scadenze_registro?user_id=eq.'+encodeURIComponent(binding.uid);
      const result=await request(binding,path+'&select=revision,payload',{accessToken:token});
      const previous=loadLocal(baselineKey);
      // Do not recreate a removed cloud register from a stale local copy.
      if (!result.length && previous) throw new Error('L’archivio online non è disponibile.');
      const remote=result[0];
      const remoteData=remote?canonical(remote.payload):canonical(blank());
      const baseline=previous??canonical(blank());
      const start=canonical(db);
      const merged=reconcile(baseline,start,remoteData,choice);
      if (merged.conflicts && !choice) {
        conflict=true;
        updateStatus(merged.conflicts+' modifiche in conflitto. Scegli quale versione conservare per queste voci.');
        return;
      }
      if (choice && merged.conflicts) {
        backupBeforeChoice();
      }
      if (!remote || !equal(merged.record,remoteData)) {
        const write={revision:remote?remote.revision+1:1,payload:merged.record};
        const saved=await request(binding,remote?path+'&revision=eq.'+remote.revision:'/rest/v1/scadenze_registro',{
          method:remote?'PATCH':'POST',accessToken:token,
          headers:{Prefer:'return=representation'},body:remote?write:{...write,user_id:binding.uid}
        });
        if (!saved?.length) {
          conflict=false;
          updateStatus('Il registro è cambiato. Riprovo con la versione aggiornata.');
          return;
        }
      }
      const latest=canonical(db);
      const duringSync=reconcile(start,latest,merged.record);
      if (duringSync.conflicts || get('modal').open) {
        // Keep current input intact and reconcile again after the editor closes.
        // Keep the old base so a divergent edit cannot overwrite an incoming one silently.
        conflict=false;
        updateStatus('Aggiornamento in attesa di completare la modifica locale.');
        return;
      }
      applyRemote(duringSync.record);
      persist(baselineKey,merged.record);
      conflict=false;
      updateStatus(equal(duringSync.record,merged.record)
        ? 'Sincronizzato alle '+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})
        : 'Modifiche locali in attesa di sincronizzazione.');
    } catch (error) {
      if (error.status===409) {
        conflict=false;
        updateStatus('Registro creato dall’altro dispositivo. Riprovo.');
      } else if (error.status===404 || error.status===403) {
        updateStatus('Archivio online non accessibile. Controlla di aver eseguito Database_Scadenze_AI.sql.');
      } else if (!session) {
        updateStatus('Sessione scaduta. Accedi di nuovo.');
      } else {
        updateStatus('Sincronizzazione in attesa. Le modifiche restano salvate sul dispositivo.');
      }
    } finally {
      running=false;
      options();
      schedule(15000);
    }
  }

  login.onsubmit=async event=>{
    event.preventDefault();
    const button=login.querySelector('button');
    const project=login.elements.project.value.trim().replace(/\/$/,'');
    const publishable=login.elements.publishable.value.trim();
    const email=login.elements.email.value.trim().toLowerCase();
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(project) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishable)) {
      updateStatus('Inserisci il Project URL Supabase e la chiave sb_publishable_.');
      return;
    }
    if (!binding && !confirm('Attivare la sincronizzazione di conti, saldi, spese, entrate, scadenze e note di Scadenze AI su questo progetto Supabase?')) return;
    button.disabled=true;
    const password=login.elements.password.value;
    login.elements.password.value='';
    try {
      const config={project,publishable,email};
      const auth=await request(config,'/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
      if (!auth?.user?.id || !auth.refresh_token || (binding && auth.user.id!==binding.uid)) throw new Error('Account inatteso.');
      binding={...config,uid:auth.user.id};
      persist(bindingKey,binding);
      persist(sessionKey,auth);
      session=auth;
      options();
      updateStatus('Accesso riuscito. Sincronizzazione in corso…');
      schedule();
    } catch (error) {
      updateStatus(error.status===400 || error.status===401
        ? 'Accesso non riuscito. Controlla email e password del tuo utente nell’app.'
        : 'Accesso non riuscito. Controlla connessione e configurazione.');
    } finally {button.disabled=false;}
  };
  get('sync-logout').onclick=async ()=>{
    if (running) return;
    clearTimeout(timer);
    const last=session;
    session=null;
    localStorage.removeItem(sessionKey);
    conflict=false;
    options();
    updateStatus('Disconnesso. Il registro locale resta su questo dispositivo.');
    try {
      await request(binding,'/auth/v1/logout?scope=local',{method:'POST',accessToken:last.access_token});
    } catch {}
  };
  get('sync-now').onclick=()=>sync();
  get('sync-local').onclick=()=>sync('local');
  get('sync-remote').onclick=()=>sync('remote');
  document.addEventListener('click',event=>{
    if(event.target.closest('#open-sync'))get('sync-panel').showModal();
  });
  get('sync-close').onclick=()=>get('sync-panel').close();
  get('modal').addEventListener('close',()=>schedule());
  window.addEventListener('scadenze-saved',()=>{
    schedule();
    if(session&&!conflict)updateStatus('Modifiche locali in attesa di sincronizzazione.');
  });
  window.addEventListener('online',()=>schedule());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  window.addEventListener('storage',event=>{
    if (event.key===sessionKey || event.key===null) {
      binding=loadLocal(bindingKey);
      session=loadLocal(sessionKey);
      conflict=false;
      options();
    }
    if (event.key===KEY) {
      if(!get('modal').open){db=load();render();}
      schedule();
    }
  });
  options();
  if (session) schedule();
})();
