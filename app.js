
const KEY='scadenzeAI_pwa_v1';
let db=load();
const state={tab:'home',account:'all',calMonth:new Date(),calSelected:new Date(),edit:null};
const $=s=>document.querySelector(s);
const euro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n||0));
const fmt=d=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(d+'T12:00:00'));
const monthName=d=>new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(d);
const uuid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function blank(){return{accounts:[],expenses:[],incomes:[],deadlines:[]}}
function load(){try{return{...blank(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return blank()}}
function save(notify=true){
  localStorage.setItem(KEY,JSON.stringify(db));
  render();
  if(notify)window.dispatchEvent(new Event('scadenze-saved'));
}
function match(x){return state.account==='all'||x.accountId===state.account}
function accName(id){return db.accounts.find(a=>a.id===id)?.name||'Nessun conto'}
function sameMonth(ds,d=new Date()){const x=new Date(ds+'T12:00:00');return x.getMonth()===d.getMonth()&&x.getFullYear()===d.getFullYear()}
function upsert(arr,o){const i=arr.findIndex(x=>x.id===o.id);i>=0?arr[i]=o:arr.push(o)}
function refreshFilter(){
  const s=$('#accountFilter');s.innerHTML='<option value="all">Tutti i conti</option>'+db.accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  s.value=state.account;
}
function render(){
  $('#month').textContent=monthName(new Date());
  refreshFilter();
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  ({home:renderHome,expenses:()=>renderItems('expense'),incomes:()=>renderItems('income'),deadlines:renderDeadlines,more:renderMore}[state.tab])();
}
function card(l,v){return`<div class="card"><div class="label">${l}</div><div class="value">${v}</div></div>`}
function renderHome(){
  const ex=db.expenses.filter(match),inc=db.incomes.filter(match),dl=db.deadlines.filter(match);
  const spend=ex.filter(x=>sameMonth(x.date)).reduce((s,x)=>s+x.amount,0);
  const income=inc.filter(x=>sameMonth(x.date)).reduce((s,x)=>s+x.amount,0);
  const unpaid=dl.filter(x=>!x.paid).reduce((s,x)=>s+x.amount,0);
  const accs=state.account==='all'?db.accounts:db.accounts.filter(a=>a.id===state.account);
  let bal=0;
  for(const a of accs){
    bal+=Number(a.initialBalance||0);
    bal+=db.incomes.filter(x=>x.accountId===a.id).reduce((s,x)=>s+x.amount,0);
    bal-=db.expenses.filter(x=>x.accountId===a.id).reduce((s,x)=>s+x.amount,0);
  }
  const upcoming=dl.filter(x=>!x.paid&&x.dueDate>=today()).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,4);
  $('#view').innerHTML=`<div class="grid">${card('Speso questo mese',euro(spend))}${card('Entrate questo mese',euro(income))}${card('Da pagare',euro(unpaid))}${card('Saldo attuale',euro(bal))}</div>
  <div class="section"><h2>Prossime scadenze</h2></div><div class="list">${upcoming.map(deadlineRow).join('')||'<div class="empty">Nessuna scadenza futura.</div>'}</div>`;
}
function renderItems(kind){
  const expense=kind==='expense',arr=(expense?db.expenses:db.incomes).filter(match).sort((a,b)=>b.date.localeCompare(a.date));
  $('#view').innerHTML=`<div class="section"><h2>${expense?'Spese':'Entrate'}</h2><strong>${euro(arr.reduce((s,x)=>s+x.amount,0))}</strong></div><div class="list">${
    arr.map(x=>`<div class="row"><div data-edit="${kind}:${esc(x.id)}"><div class="title">${esc(x.title)}</div><div class="sub">${esc(x.category)} · ${esc(accName(x.accountId))} · ${fmt(x.date)}</div></div><div><div class="amount">${expense?'−':'＋'} ${euro(x.amount)}</div><button class="danger" data-del="${kind}:${esc(x.id)}">Elimina</button></div></div>`).join('')||'<div class="empty">Nessun elemento.</div>'
  }</div><button class="fab" data-add="${kind}">＋</button>`;
}
function deadlineRow(x){return`<div class="row"><div><div class="title">${esc(x.title)}</div><div class="sub">${esc(x.category)} · ${esc(accName(x.accountId))} · ${fmt(x.dueDate)}</div></div><div><div class="amount">${euro(x.amount)}</div><span class="pill ${x.paid?'paid':''}">${x.paid?'Pagata':'Da pagare'}</span></div></div>`}
function renderDeadlines(){
  const arr=db.deadlines.filter(match).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  $('#view').innerHTML=`<div class="section"><h2>Scadenze</h2><strong>${euro(arr.filter(x=>!x.paid).reduce((s,x)=>s+x.amount,0))}</strong></div><div class="list">${
    arr.map(x=>`<div class="row"><div data-edit="deadline:${esc(x.id)}"><div class="title">${esc(x.title)}</div><div class="sub">${esc(x.category)} · ${esc(accName(x.accountId))} · ${fmt(x.dueDate)}${x.recurrence&&x.recurrence!=='Nessuna'?' · '+esc(x.recurrence):''}</div></div><div><div class="amount">${euro(x.amount)}</div>${x.paid?'<span class="pill paid">Pagata</span>':`<button class="secondary" data-pay="${esc(x.id)}">Segna pagata</button>`}<button class="danger" data-del="deadline:${esc(x.id)}">Elimina</button></div></div>`).join('')||'<div class="empty">Nessuna scadenza.</div>'
  }</div><button class="fab" data-add="deadline">＋</button>`;
}
function renderMore(){
  $('#view').innerHTML=`<div class="more">
  <button data-more="calendar"><strong>Calendario</strong><div class="sub">Scadenze per giorno</div></button>
  <button data-more="accounts"><strong>Conti</strong><div class="sub">Saldi e gestione conti</div></button>
  <button data-more="backup"><strong>Backup</strong><div class="sub">Esporta/importa dati</div></button>
  <button id="open-sync"><strong>Sincronizzazione</strong><div class="sub">Usa lo stesso archivio su Mac e iPhone</div></button>
  <button id="install"><strong>Installa su iPhone</strong><div class="sub">Aggiungi alla schermata Home</div></button></div>`;
}
function renderAccounts(){
  $('#view').innerHTML=`<div class="section"><h2>Conti</h2><button class="primary" data-add="account">Nuovo conto</button></div>`+
  (db.accounts.map(a=>{
    const inc=db.incomes.filter(x=>x.accountId===a.id).reduce((s,x)=>s+x.amount,0),ex=db.expenses.filter(x=>x.accountId===a.id).reduce((s,x)=>s+x.amount,0),un=db.deadlines.filter(x=>x.accountId===a.id&&!x.paid).reduce((s,x)=>s+x.amount,0),bal=Number(a.initialBalance||0)+inc-ex;
    return`<div class="account"><div class="row" style="border:0;padding:0"><div><div class="title">${esc(a.name)}</div><div class="sub">${esc(a.bankName||'')}</div></div><strong>${euro(bal)}</strong></div><div class="metrics"><div class="metric"><span>Saldo iniziale</span><strong>${euro(a.initialBalance)}</strong></div><div class="metric"><span>Entrate</span><strong>${euro(inc)}</strong></div><div class="metric"><span>Spese</span><strong>${euro(ex)}</strong></div><div class="metric"><span>Da pagare</span><strong>${euro(un)}</strong></div></div><div style="margin-top:10px"><button class="danger" data-del="account:${esc(a.id)}">Elimina</button></div></div>`
  }).join('')||'<div class="empty">Nessun conto.</div>')+`<button class="secondary" data-back style="margin-top:14px">← Altro</button>`;
}
function renderCalendar(){
  const y=state.calMonth.getFullYear(),m=state.calMonth.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),offset=(first.getDay()+6)%7,dl=db.deadlines.filter(match);
  let cells='';for(let i=0;i<offset;i++)cells+='<div></div>';
  for(let d=1;d<=last.getDate();d++){const dt=new Date(y,m,d),key=dt.toISOString().slice(0,10),items=dl.filter(x=>x.dueDate===key),sel=state.calSelected.toDateString()===dt.toDateString()?' sel':'';cells+=`<button class="day${sel}" data-day="${key}">${d}${items.length?`<div class="dot ${items.some(x=>!x.paid)?'':'green'}"></div>`:''}</button>`}
  const key=state.calSelected.toISOString().slice(0,10),sel=dl.filter(x=>x.dueDate===key);
  $('#view').innerHTML=`<div class="calhead"><button class="secondary" data-nav="-1">‹</button><h2>${monthName(state.calMonth)}</h2><button class="secondary" data-nav="1">›</button></div><div class="cal">${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(x=>`<div class="wd">${x}</div>`).join('')}${cells}</div><div class="section"><h2>${fmt(key)}</h2></div><div class="list">${sel.map(deadlineRow).join('')||'<div class="empty">Nessuna scadenza.</div>'}</div><button class="secondary" data-back style="margin-top:14px">← Altro</button>`;
}
function renderBackup(){
  $('#view').innerHTML=`<div class="section"><h2>Backup dati</h2></div><div class="card"><p>Il backup contiene i dati salvati su questo dispositivo. Se la sincronizzazione è attiva, una sostituzione si riflette anche online.</p><button class="primary" id="export">Esporta backup JSON</button> <button class="secondary" id="import">Importa backup JSON</button><hr style="border:0;border-top:1px solid #eee;margin:18px 0"><button class="danger" id="reset">Cancella tutti i dati</button></div><button class="secondary" data-back style="margin-top:14px">← Altro</button>`;
}
function openModal(kind,item=null){
 state.edit={kind,id:item?.id||null};$('#mtitle').textContent=(item?'Modifica ':'Nuovo ')+({expense:'spesa',income:'entrata',deadline:'scadenza',account:'conto'}[kind]);
 const accounts='<option value="">Nessun conto</option>'+db.accounts.map(a=>`<option value="${esc(a.id)}" ${item?.accountId===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
 let h='';
 if(kind==='account')h=`<div class="field"><label>Nome conto</label><input name="name" required value="${esc(item?.name||'')}"></div><div class="field"><label>Banca</label><input name="bankName" value="${esc(item?.bankName||'')}"></div><div class="field"><label>Saldo iniziale €</label><input name="initialBalance" type="number" step="0.01" value="${esc(item?.initialBalance??0)}"></div>`;
 else if(kind==='deadline')h=`<div class="field"><label>Descrizione</label><input name="title" required value="${esc(item?.title||'')}"></div><div class="field"><label>Importo €</label><input name="amount" type="number" step="0.01" required value="${esc(item?.amount??'')}"></div><div class="field"><label>Data scadenza</label><input name="dueDate" type="date" required value="${esc(item?.dueDate||today())}"></div><div class="field"><label>Conto</label><select name="accountId">${accounts}</select></div><div class="field"><label>Categoria</label><input name="category" value="${esc(item?.category||'Altro')}"></div><div class="field"><label>Ricorrenza</label><select name="recurrence">${['Nessuna','Ogni mese','Ogni 2 mesi','Ogni 3 mesi','Ogni 6 mesi','Ogni anno'].map(x=>`<option ${item?.recurrence===x?'selected':''}>${x}</option>`).join('')}</select></div>`;
 else h=`<div class="field"><label>Descrizione</label><input name="title" required value="${esc(item?.title||'')}"></div><div class="field"><label>Importo €</label><input name="amount" type="number" step="0.01" required value="${esc(item?.amount??'')}"></div><div class="field"><label>Data</label><input name="date" type="date" required value="${esc(item?.date||today())}"></div><div class="field"><label>Conto</label><select name="accountId">${accounts}</select></div><div class="field"><label>Categoria</label><input name="category" value="${esc(item?.category||(kind==='income'?'Stipendio':'Altro'))}"></div><div class="field"><label>Note</label><textarea name="notes">${esc(item?.notes||'')}</textarea></div>`;
 $('#mbody').innerHTML=h;$('#modal').showModal();
}
function saveModal(){
 const o=Object.fromEntries(new FormData($('#form')).entries()),k=state.edit.kind,eid=state.edit.id;
 if(k==='account')upsert(db.accounts,{id:eid||uuid(),name:o.name,bankName:o.bankName,initialBalance:Number(o.initialBalance||0)});
 else if(k==='expense'||k==='income')upsert(k==='expense'?db.expenses:db.incomes,{id:eid||uuid(),title:o.title,amount:Number(o.amount),date:o.date,accountId:o.accountId||null,category:o.category||'Altro',notes:o.notes||''});
 else{const old=db.deadlines.find(x=>x.id===eid);upsert(db.deadlines,{id:eid||uuid(),title:o.title,amount:Number(o.amount),dueDate:o.dueDate,accountId:o.accountId||null,category:o.category||'Altro',recurrence:o.recurrence||'Nessuna',paid:old?.paid||false})}
 save();
}
function pay(idv){
 const d=db.deadlines.find(x=>x.id===idv);if(!d||d.paid)return;d.paid=true;
 db.expenses.push({id:'pagamento-'+d.id,title:d.title,amount:d.amount,date:today(),accountId:d.accountId,category:d.category,notes:'Pagamento da scadenza'});
 const n={'Ogni mese':1,'Ogni 2 mesi':2,'Ogni 3 mesi':3,'Ogni 6 mesi':6,'Ogni anno':12}[d.recurrence];
 if(n){const nd=new Date(d.dueDate+'T12:00:00');nd.setMonth(nd.getMonth()+n);db.deadlines.push({...d,id:'ric-'+(d.id.startsWith('ric-')?d.id.slice(4,-11):d.id)+'-'+nd.toISOString().slice(0,10),dueDate:nd.toISOString().slice(0,10),paid:false})}
 save();
}
function del(kind,idv){
 if(!confirm('Eliminare questo elemento?'))return;
 if(kind==='account'){db.accounts=db.accounts.filter(x=>x.id!==idv);[db.expenses,db.incomes,db.deadlines].forEach(a=>a.forEach(x=>{if(x.accountId===idv)x.accountId=null}));if(state.account===idv)state.account='all'}
 else db[{expense:'expenses',income:'incomes',deadline:'deadlines'}[kind]]=db[{expense:'expenses',income:'incomes',deadline:'deadlines'}[kind]].filter(x=>x.id!==idv);
 save();
}
document.addEventListener('click',e=>{
 const t=e.target.closest('[data-tab]');if(t){state.tab=t.dataset.tab;render();return}
 const a=e.target.closest('[data-add]');if(a){openModal(a.dataset.add);return}
 const d=e.target.closest('[data-del]');if(d){const[k,i]=d.dataset.del.split(':');del(k,i);return}
 const ed=e.target.closest('[data-edit]');if(ed){const[k,i]=ed.dataset.edit.split(':');const map={expense:db.expenses,income:db.incomes,deadline:db.deadlines};openModal(k,map[k].find(x=>x.id===i));return}
 const p=e.target.closest('[data-pay]');if(p){pay(p.dataset.pay);return}
 const m=e.target.closest('[data-more]');if(m){m.dataset.more==='calendar'?renderCalendar():m.dataset.more==='accounts'?renderAccounts():renderBackup();return}
 if(e.target.closest('[data-back]')){renderMore();return}
 const n=e.target.closest('[data-nav]');if(n){state.calMonth.setMonth(state.calMonth.getMonth()+Number(n.dataset.nav));renderCalendar();return}
 const dy=e.target.closest('[data-day]');if(dy){state.calSelected=new Date(dy.dataset.day+'T12:00:00');renderCalendar();return}
 if(e.target.closest('#install')||e.target.closest('#help'))alert('Su iPhone: apri questo sito in Safari → Condividi → Aggiungi alla schermata Home.');
 if(e.target.closest('#export')){const b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ScadenzeAI-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
 if(e.target.closest('#import'))$('#importFile').click();
 if(e.target.closest('#reset')&&confirm('Cancellare tutti i dati? Se la sincronizzazione è attiva verranno rimossi anche dall’archivio online.')){db=blank();save()}
});
$('#accountFilter').addEventListener('change',e=>{state.account=e.target.value;render()});
$('#form').addEventListener('submit',e=>{if(e.submitter?.value==='default')saveModal()});
$('#importFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{
  const restored=window.normalizeScadenze(JSON.parse(await f.text()));
  if(confirm('Sostituire i dati di questo dispositivo con il backup? Se collegato, l’aggiornamento verrà sincronizzato.')){
    const prior=db;
    db=restored;
    try{save();}catch(error){db=prior;throw error;}
    alert('Backup importato.');
  }
}catch{alert('File non valido.')}e.target.value=''});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
render();
