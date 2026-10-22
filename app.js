const $=id=>document.getElementById(id);
const legacyFields=['id','name','link','company','role','last','platform','next','step','notes'];
const fields=[...legacyFields,'whatsapp','email'];
let legacySchema=false,demo=false;
let records=[],dueOnly=false,token='',expiry=0,busy=false,editingSnapshot=null;
let lastSynced=0,syncError='',refreshTask=null,refreshFailures=0,nextRefreshAt=0;
const REFRESH_INTERVAL=30000;
function updateSyncStatus(){
 $('storageStatus').textContent=demo?'Sample notebook · Changes are temporary':syncError?syncError:token&&settings.sheet?lastSynced?'Auto-sync · Every 30s · Last updated '+new Date(lastSynced).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Auto-sync ready':'Google Sheets · Connect to load your connections';
}
const settings=JSON.parse(localStorage.getItem('kinship.settings')||'{}');
if(!settings.client)settings.client='475988922667-0inqpb1i23fv3p88v9l6jp89nfse8qcg.apps.googleusercontent.com';
const today=()=>new Date().toLocaleDateString('en-CA');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink=s=>{try{let u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',6000)}
function companyKey(value){return String(value||'').trim().normalize('NFKC').toLocaleLowerCase()}
function contactActions(r){
 const actions=[];if(safeLink(r.link))actions.push({label:'LinkedIn / profile',url:safeLink(r.link),kind:'profile'});
 const phone=String(r.whatsapp||'').replace(/[\s()+.-]/g,'');
 if(/^\d{7,15}$/.test(phone))actions.push({label:'WhatsApp',url:'https://wa.me/'+phone,kind:'whatsapp'});
 const email=String(r.email||'').trim();if(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))actions.push({label:'Email',url:'mailto:'+encodeURIComponent(email),kind:'email'});
 return actions;
}
function visibleRecords(){
 const q=$('search').value.trim().toLocaleLowerCase();const company=$('companyFilter').value;
 return records.filter(r=>(!dueOnly||(r.next&&r.next<=today()))&&(!company||companyKey(r.company)===company)&&(!$('platformFilter').value||r.platform===$('platformFilter').value)&&fields.some(f=>f!=='id'&&String(r[f]||'').toLocaleLowerCase().includes(q)));
}
function render(){
 $('allNav').setAttribute('aria-pressed',String(!dueOnly));$('dueNav').setAttribute('aria-pressed',String(dueOnly));
 $('demoBanner').hidden=!demo;
 updateSyncStatus();
 const companies=new Map();for(const r of records){const key=companyKey(r.company);if(key){const c=companies.get(key)||{name:r.company.trim(),count:0};c.count++;companies.set(key,c)}}
 const selected=$('companyFilter').value;
 $('companyFilter').innerHTML='<option value="">All companies</option>'+[...companies].sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([key,c])=>`<option value="${esc(key)}">${esc(c.name)} (${c.count})</option>`).join('');
 $('companyFilter').value=companies.has(selected)?selected:'';
 $('companyCount').textContent=companies.size;$('companySuggestions').innerHTML=[...companies.values()].map(c=>`<option value="${esc(c.name)}"></option>`).join('');
 const due=records.filter(r=>r.next&&r.next<=today());
 $('total').textContent=records.length;$('due').textContent=$('dueBadge').textContent=due.length;
 $('recent').textContent=records.filter(r=>r.last&&r.last.slice(0,7)===today().slice(0,7)).length;
 const list=visibleRecords();const sort=$('sort').value;
 list.sort((a,b)=>sort==='company'?companyKey(a.company).localeCompare(companyKey(b.company))||a.name.localeCompare(b.name):sort==='name'?a.name.localeCompare(b.name):sort==='last'?(b.last||'').localeCompare(a.last||''):(a.next||'9999').localeCompare(b.next||'9999'));
 $('rows').innerHTML=list.map(r=>`<article class="contact-card"><div class="card-top"><span class="avatar" aria-hidden="true">${esc(r.name.slice(0,2))}</span><button class="open-contact" data-edit="${esc(r.id)}" aria-label="Open ${esc(r.name)}">↗</button></div><button class="contact-name" data-edit="${esc(r.id)}" dir="auto">${esc(r.name)}</button><p class="contact-role" dir="auto">${esc(r.role)||'Role not added'}</p><button class="company-chip" data-company="${esc(companyKey(r.company))}" ${!r.company?'disabled':''} dir="auto">${esc(r.company)||'Company not added'}</button><div class="conversation"><span>LAST CONVERSATION</span><strong>${esc(r.last)||'Not recorded'} ${r.platform?`<small>· ${esc(r.platform)}</small>`:''}</strong></div>${r.notes?`<p class="card-note" dir="auto">${esc(r.notes)}</p>`:'<p class="card-note muted">No conversation notes yet.</p>'}<div class="contact-actions">${contactActions(r).map(a=>`<a class="channel ${a.kind}" href="${esc(a.url)}" ${a.kind!=='email'?'target="_blank" rel="noopener noreferrer"':''} aria-label="${esc(a.label)}: ${esc(r.name)}">${esc(a.label)}</a>`).join('')||'<span class="muted">Add contact details to reach out</span>'}</div><div class="card-bottom"><span class="${r.next&&r.next<=today()?'overdue':''}">${r.next?'Follow up '+esc(r.next):'No follow-up scheduled'}</span><button data-edit="${esc(r.id)}">Details</button></div></article>`).join('');
 $('empty').hidden=list.length>0;$('empty').querySelector('h3').textContent=records.length?'No matching connections.':'Your notebook starts with one person';$('count').textContent=`${list.length} of ${records.length} connections`;
}
function edit(id){if(!token&&!demo){toast('Connect Google Sheets first.');$('settings').showModal();return}const r=records.find(r=>r.id===id);editingSnapshot=r?{...r}:null;$('form').reset();for(const f of fields)$('form').elements[f].value=r?.[f]||'';$('modalTitle').textContent=r?'Connection details':'Add connection';$('delete').hidden=!r;$('editor').showModal()}
async function api(path,options={}){if(!token||Date.now()>=expiry){token='';syncError='Google session expired · Connect Google again';updateSyncStatus();throw Error('Please connect Google again; your session has expired.')}const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets'+path,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});if(!response.ok){if(response.status===401){token='';syncError='Google session expired · Connect Google again';updateSyncStatus();}let e=await response.json().catch(()=>({}));throw Error(e.error?.message||'Google Sheets request failed')}return response.status===204?{}:response.json()}
const range="'Connections'!A:L";
async function load(){const sourceToken=token,sourceSheet=settings.sheet;if(!settings.sheet)throw Error('Create a connection sheet first.');const data=await api('/'+encodeURIComponent(settings.sheet)+'/values/'+encodeURIComponent(range));if(token!==sourceToken||settings.sheet!==sourceSheet||demo)return;const rows=data.values||[];legacySchema=JSON.stringify(rows[0])===JSON.stringify(legacyFields);if(!rows.length||(!legacySchema&&JSON.stringify(rows[0])!==JSON.stringify(fields)))throw Error('The Connections tab has different columns. Use a new sheet to avoid changing existing data.');records=rows.slice(1).map((row,i)=>({...Object.fromEntries(fields.map((f,j)=>[f,row[j]||''])),_row:i+2})).filter(r=>r.id);lastSynced=Date.now();syncError='';refreshFailures=0;nextRefreshAt=lastSynced+REFRESH_INTERVAL;render();$('syncStatus').textContent='Connected to Google Sheets';}
async function mutate(action){if(busy)return;busy=true;document.querySelectorAll('#form button').forEach(b=>b.disabled=true);try{if(refreshTask)await refreshTask;await action()}catch(e){toast(e.message)}finally{busy=false;document.querySelectorAll('#form button').forEach(b=>b.disabled=false)}}
function checkConflict(current,expected){if(expected&&(!current||fields.some(f=>(current[f]||'')!==(expected[f]||''))))throw Error('This connection changed or was deleted on another device. Close and reopen it before saving.');}
async function writeRecord(r,expected=null){if(demo){const i=records.findIndex(x=>x.id===r.id);if(i<0)records.push(r);else records[i]=r;render();return}await load();const index=records.findIndex(x=>x.id===r.id);checkConflict(records[index],expected);if(legacySchema){await api('/'+settings.sheet+'/values/'+encodeURIComponent("'Connections'!K1:L1")+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[['whatsapp','email']]})});legacySchema=false;}if(index<0){await api('/'+settings.sheet+'/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:[fields.map(f=>r[f]||'')]})})}else{await api('/'+settings.sheet+'/values/'+encodeURIComponent(`'Connections'!A${records[index]._row}:L${records[index]._row}`)+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[fields.map(f=>r[f]||'')]})})}await load()}
$('form').onsubmit=e=>{e.preventDefault();const r=Object.fromEntries(new FormData(e.target));r.name=r.name.trim();if(!r.name)return;r.id=r.id||crypto.randomUUID();mutate(async()=>{await writeRecord(r,editingSnapshot);$('editor').close();toast(demo?'Sample connection updated — not saved to Google.':'Connection saved to Google Sheets.')})};
$('delete').onclick=()=>{const id=$('form').elements.id.value;if(!confirm('Delete this connection from Google Sheets?'))return;mutate(async()=>{if(demo){records=records.filter(r=>r.id!==id);render();$('editor').close();return}await load();const index=records.findIndex(r=>r.id===id);if(index<0)throw Error('This connection no longer exists.');checkConflict(records[index],editingSnapshot);await api('/'+settings.sheet+'/values/'+encodeURIComponent(`'Connections'!A${records[index]._row}:L${records[index]._row}`)+':clear',{method:'POST',body:'{}'});await load();$('editor').close();toast('Connection deleted.')})};
$('add').onclick=$('emptyAdd').onclick=()=>edit();$('close').onclick=()=>$('editor').close();$('rows').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)edit(b.dataset.edit);const c=e.target.closest('[data-company]');if(c){$('companyFilter').value=c.dataset.company;render()}};
['search','companyFilter','platformFilter','sort'].forEach(id=>$(id).addEventListener('input',render));
$('allNav').onclick=()=>{dueOnly=false;$('allNav').classList.add('active');$('dueNav').classList.remove('active');render()};$('dueNav').onclick=()=>{dueOnly=true;$('dueNav').classList.add('active');$('allNav').classList.remove('active');render()};
$('export').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({version:1,connections:records},null,2)],{type:'application/json'}));a.href=url;a.download=`connections-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('import').hidden=true;$('importFile').hidden=true;
$('clearFilters').onclick=()=>{for(const id of ['search','companyFilter','platformFilter'])$(id).value='';dueOnly=false;$('allNav').classList.add('active');$('dueNav').classList.remove('active');render()};
function persistSettings(){localStorage.setItem('kinship.settings',JSON.stringify(settings))}
$('settingsButton').onclick=()=>{$('sheetActions').hidden=!settings.sheet;$('settings').showModal()};$('settingsClose').onclick=()=>$('settings').close();$('clientId').value=settings.client||'';$('sheetId').value=settings.sheet||'';
async function acceptGoogleToken(response){
 if(response.error)return toast(response.error);
 demo=false;lastSynced=0;syncError='';refreshFailures=0;nextRefreshAt=0;token=response.access_token;expiry=Date.now()+Number(response.expires_in)*1000;
 $('syncStatus').textContent='Google connected';$('createSheet').disabled=false;
 try{if(settings.sheet){await load();$('settings').close()}else{render();toast('Connected. Create your connection sheet below.')}}catch(e){toast(e.message)}
}
if(window.desktopApp){
 document.documentElement.classList.add('desktop');
 window.desktopApp.onGoogleToken(acceptGoogleToken);
 $('settingsTitle').textContent='Connect Google Sheets';
}
$('connect').onclick=()=>{
 const client=$('clientId').value.trim();
 if(!client.endsWith('.apps.googleusercontent.com'))return toast('Enter your Google OAuth web client ID.');
 settings.client=client;settings.sheet=$('sheetId').value.trim().replace(/^.*\/spreadsheets\/d\/([a-zA-Z0-9_-]+).*$/,'$1');persistSettings();
 if(window.desktopApp){$('syncStatus').textContent='Continue sign-in in your browser, then return here.';window.desktopApp.connectGoogle(client).catch(e=>toast(e.message));return}
 if(!window.google?.accounts?.oauth2)return toast('Google sign-in has not loaded. Check your internet connection.');
 google.accounts.oauth2.initTokenClient({client_id:client,scope:'https://www.googleapis.com/auth/drive.file',callback:acceptGoogleToken,error_callback:()=>toast('Google sign-in was closed or could not open.')}).requestAccessToken();
};
$('createSheet').onclick=()=>mutate(async()=>{if(settings.sheet&&!confirm('Create a new empty sheet and switch to it? The previous sheet will be kept.'))return;const created=await api('',{method:'POST',body:JSON.stringify({properties:{title:'Connection Tracker — Job connections'},sheets:[{properties:{title:'Connections',gridProperties:{frozenRowCount:1}}}]})});settings.sheet=created.spreadsheetId;persistSettings();$('sheetId').value=settings.sheet;$('sheetActions').hidden=false;await api('/'+settings.sheet+'/values/'+encodeURIComponent("'Connections'!A1:L1")+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[fields]})});await load();$('settings').close();toast('Your Google Sheet is ready.')});
function autoRefresh({force=false,manual=false}={}){
 if(demo){if(manual)toast('Sample notebook. Connect Google Sheets for your real connections.');return Promise.resolve()}
 if(refreshTask)return refreshTask;
 if(!token||!settings.sheet){if(manual)toast('Connect Google Sheets first.');return Promise.resolve()}
 if(busy||$('editor').open||$('settings').open)return Promise.resolve();
 if(navigator.onLine===false){syncError='Offline · Auto-sync resumes when you reconnect';updateSyncStatus();return Promise.resolve()}
 if(!manual&&document.hidden)return Promise.resolve();
 if(!force&&Date.now()<nextRefreshAt)return Promise.resolve();
 refreshTask=(async()=>{
  try{await load();if(manual)toast('Updated from Google Sheets.')}
  catch(e){refreshFailures++;nextRefreshAt=Date.now()+Math.min(300000,REFRESH_INTERVAL*2**refreshFailures);syncError=token?'Sync paused · Retrying automatically'+(lastSynced?' · Showing last loaded contacts':''):'Google session expired · Connect Google again';updateSyncStatus();if(manual)toast(e.message)}
  finally{refreshTask=null}
 })();return refreshTask;
}
$('refresh').onclick=()=>autoRefresh({force:true,manual:true});
window.addEventListener('focus',()=>autoRefresh({force:true}));
window.addEventListener('online',()=>autoRefresh({force:true}));
window.addEventListener('offline',()=>{if(token&&!demo){syncError='Offline · Auto-sync resumes when you reconnect';updateSyncStatus()}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)autoRefresh({force:true})});
$('editor').addEventListener('close',()=>autoRefresh());
$('settings').addEventListener('close',()=>autoRefresh());
setInterval(()=>autoRefresh(),REFRESH_INTERVAL);
$('disconnect').onclick=()=>{if(token&&window.google)google.accounts.oauth2.revoke(token,()=>{});if(window.desktopApp)window.desktopApp.cancelGoogle();token='';expiry=0;lastSynced=0;syncError='';demo=false;records=[];render();$('syncStatus').textContent='Google disconnected';$('createSheet').disabled=true;toast('Disconnected.')};
$('demoButton').onclick=()=>{if(token)return toast('Disconnect Google before opening the sample notebook.');demo=true;records=[{id:'demo-1',name:'Maya Cohen',company:'Northstar',role:'Talent Acquisition Partner',last:today(),platform:'LinkedIn',link:'https://www.linkedin.com/',whatsapp:'+1 202 555 0147',email:'maya@example.com',notes:'Sample: discussed student engineering opportunities and the hiring process.'},{id:'demo-2',name:'Daniel Levi',company:'Northstar',role:'Software Engineer',last:today(),platform:'WhatsApp',link:'https://www.linkedin.com/',notes:'Sample: offered to explain the team’s day-to-day work.',next:today()},{id:'demo-3',name:'נועה לוי',company:'Horizon Labs',role:'מהנדסת מערכות · Systems Engineer',last:today(),platform:'Email',email:'noa@example.com',notes:'דוגמה: שוחחנו על תפקידי סטודנט ואפשרויות בצוות.'}];render()};
$('exitDemo').onclick=()=>{demo=false;records=[];for(const id of ['search','companyFilter','platformFilter'])$(id).value='';render()};
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{if(window.desktopApp)return;event.preventDefault();installPrompt=event;$('installApp').hidden=false});
window.addEventListener('appinstalled',()=>{installPrompt=null;$('installApp').hidden=true});
$('installApp').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installApp').hidden=true};
$('copySheet').onclick=async()=>{if(!settings.sheet)return toast('Create or connect your sheet first.');try{await navigator.clipboard.writeText('https://docs.google.com/spreadsheets/d/'+settings.sheet+'/edit');toast('Sheet link copied. Paste it into Google Sheets settings on your phone.')}catch{toast('Copy the sheet URL or ID from the field above.')}};
$('openSheet').onclick=()=>{if(settings.sheet)window.open('https://docs.google.com/spreadsheets/d/'+encodeURIComponent(settings.sheet)+'/edit','_blank','noopener,noreferrer')};
render();if(window.desktopApp&&!settings.sheet)$('settings').showModal();if(!window.desktopApp&&'serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
