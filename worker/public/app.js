import {MONTHS,DEPTS,DEFAULT_VIEW,daysInMonth,setLiveRecords,filteredEmployees,detailEmployees,stats,shiftsFor} from './model.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('uz-UZ'),pct=n=>n===null?'—':n.toFixed(1)+'%';
const labels={present:'Ishda',absent:'Yo‘q',rest:'Dam olish'};
const roleNames={computer:'Admin-kompyuter',phone:'Telefon',monitor:'Monitor'};
const SHEET_ID='1IWyUdorge58MbvpNlB5Z08Rawm8AdoeHinxgjiFktF4';
const url=new URL(location.href);let role=url.searchParams.get('mode')||(location.pathname==='/monitor'?'monitor':location.pathname==='/phone'?'phone':innerWidth<760?'phone':'computer');
if(!['computer','phone','monitor'].includes(role))role='computer';
const newDeviceId=()=>crypto.randomUUID?.()||`device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
let clientId;try{clientId=sessionStorage.getItem('asosiyDevice');if(!clientId){clientId=newDeviceId();sessionStorage.setItem('asosiyDevice',clientId);}}catch{clientId=newDeviceId();}
let view={...DEFAULT_VIEW},remote=null,connected=false,active=false,busy=false,dirty=false,localVersion=0,lastHeartbeat=0,pollBusy=false,dataBusy=false,dataOnline=false,noticeTimer;
$('deviceRole').value=role;
$('month').innerHTML=MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('');
$('departmentFilter').innerHTML='<option value="">Barcha bo‘limlar</option>'+DEPTS.map(d=>`<option value="${d.code}">${esc(d.name)}</option>`).join('');
function notify(msg){$('notice').textContent=msg;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',6500);}
function bar(d,rs,selected){const q=stats(rs);return `<div class="barrow ${selected?'selected':''}" data-department="${d.code}" role="button" tabindex="0" aria-label="${esc(d.name)} bo‘limini tanlash"><span>${esc(d.name)}</span><div class="track"><div class="fill" style="width:${q.rate??0}%"></div></div><strong>${pct(q.rate)}</strong></div>`;}
function uiPermissions(){
 const can=active&&connected;
 for(const el of document.querySelectorAll('#month,#day,#globalFilters select,#globalFilters button,.nav [data-page],#detail input,#detail select'))el.disabled=!can;
 document.querySelector('.main').classList.toggle('read-only',!can);
 document.body.classList.toggle('monitor-mode',role==='monitor');
 document.querySelector('.app').classList.toggle('admin-compact',role==='monitor');
 $('claim').hidden=role==='monitor';$('claim').disabled=busy||!connected||active;
 $('claim').textContent=active?'Boshqaruv sizda':role==='phone'?'Telefondan boshqarish':'Kompyuterdan boshqarish';
 $('release').hidden=role!=='phone'||!active;$('release').disabled=busy||!connected;
 $('connection').textContent=connected?'● Ulangan':'● Aloqa yo‘q';$('connection').className=connected?'live':'offline';
 $('controlSource').textContent=`Boshqaruv: ${roleNames[remote?.source||'computer']}${role==='monitor'?' · faqat ko‘rish':active?' · sizda':' · kuzatuv'}`;
}
function render(){
 $('month').value=view.month;$('day').value=view.day;$('day').max=daysInMonth(view.month);
 $('departmentFilter').value=view.department;$('hoursFilter').value=view.hours;
 const shifts=shiftsFor({...view,shift:''});if(view.shift&&!shifts.includes(view.shift))shifts.push(view.shift);
 $('shiftFilter').innerHTML='<option value="">Barcha smenalar</option>'+shifts.sort((a,b)=>a.localeCompare(b,'uz',{numeric:true})).map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');$('shiftFilter').value=view.shift;
 const all=filteredEmployees(view,true),rs=filteredEmployees(view),q=stats(rs),d=DEPTS.find(x=>x.code===view.department);
 $('sideRows').innerHTML=DEPTS.map(x=>`<div class="side-row ${x.code===view.department?'selected':''}" data-department="${x.code}" role="button" tabindex="0"><div>${x.code}</div><div>${esc(x.name)}</div><div>${all.filter(r=>r.department===x.code).length}</div></div>`).join('')+`<div class="side-row side-total" data-department="" role="button" tabindex="0"><div></div><div>JAMI</div><div>${all.length}</div></div>`;
 $('total').textContent=q.total;$('present').textContent=q.present;$('absent').textContent=q.absent;$('rate').textContent=pct(q.rate);
 $('pie').style.setProperty('--present',(q.rate??0)+'%');$('pie').style.background=q.rate===null?'#e6e6e6':'';$('pieText').textContent=pct(q.rate);
 $('rate').parentElement.title=`${q.present} ishda / (${q.present} ishda + ${q.absent} yo‘q). Dam olish: ${q.rest}.`;
 $('pie').title=q.rest?`Dam olish: ${q.rest}. Davomat hisobiga kirmaydi.`:'Davomat foizi';
 const ds=view.department?DEPTS.filter(x=>x.code===view.department):DEPTS;
 $('bars').innerHTML=ds.map(x=>bar(x,rs.filter(r=>r.department===x.code),x.code===view.department)).join('');
 $('deptTable').innerHTML=ds.map((x,i)=>{const t=stats(rs.filter(r=>r.department===x.code));return `<tr class="${view.department===x.code?'selected-row':''}" data-department="${x.code}"><td class="num">${i+1}</td><td>${esc(x.name)}</td><td class="num">${t.total}</td><td class="num">${t.present}</td><td class="num">${t.absent}</td><td class="num">${pct(t.rate)}</td><td class="num"><button data-list="all" data-list-dept="${x.code}" aria-label="${esc(x.name)} xodimlari">→</button></td></tr>`;}).join('')+`<tr class="total"><td></td><td>JAMI${q.rest?' · Dam olish: '+q.rest:''}</td><td class="num">${q.total}</td><td class="num">${q.present}</td><td class="num">${q.absent}</td><td class="num">${pct(q.rate)}</td><td></td></tr>`;
 for(const [i,id] of ['v1','v2','v3'].entries())$(id).classList.toggle('active',!view.detail&&view.page===i+1);
 $('detail').classList.toggle('active',!!view.detail);
 document.querySelectorAll('.nav [data-page]').forEach(el=>{el.classList.toggle('active',Number(el.dataset.page)===view.page);el.setAttribute('aria-pressed',String(Number(el.dataset.page)===view.page));});
 $('title').textContent=[null,'Kunlik davomad','Ish soatlari','KPI ko‘rsatkichlari'][view.page]+(d?' — '+d.name:'')+(view.detail?' — batafsil':'');$('pageNo').textContent=view.page+' / 3';
 renderHours(rs,ds);renderKPI(rs,ds);if(view.detail)renderDetail();uiPermissions();
}
function renderHours(rs,ds){
 const sumRows=rows=>rows.reduce((a,r)=>a+r.totalHours,0);
 const group=(view.department?[...new Set(rs.map(r=>r.shift).filter(Boolean))].map(s=>({label:`${s} smena`,rows:rs.filter(r=>r.shift===s),shift:s,department:view.department})):ds.map(d=>({label:d.name,rows:rs.filter(r=>r.department===d.code),shift:'',department:d.code}))).sort((a,b)=>sumRows(b.rows)-sumRows(a.rows));
 $('overtime').innerHTML=group.map(g=>{const sum=k=>g.rows.reduce((a,r)=>a+r[k],0);return `<div class="shift hours-group"><h3><button data-hours-dept="${g.department}" data-hours-shift="${g.shift}">${esc(g.label)} · ${g.rows.length} xodim →</button></h3><div class="shiftrow"><div>Fond</div><div>Oylik reja</div><div class="v">${number(sum('fond'))}</div></div><div class="shiftrow"><div>Ish soat</div><div>Asosiy soatlar</div><div class="v">${number(sum('work'))}</div></div><div class="shiftrow"><div>Ortiqcha</div><div>Qo‘shimcha soatlar</div><div class="v">${number(sum('overtime'))}</div></div><div class="shiftrow"><div>Jami</div><div>soat</div><div class="v">${number(sum('totalHours'))}</div></div></div>`;}).join('')||'<p class="empty">Bu filtrlar bo‘yicha xodim topilmadi.</p>';
 const counts=ds.map(d=>({d,total:rs.filter(r=>r.department===d.code).reduce((a,r)=>a+r.totalHours,0)})).sort((a,b)=>b.total-a.total);const max=Math.max(1,...counts.map(x=>x.total));
 $('otbars').innerHTML=counts.map(x=>`<div class="barrow"><span>${esc(x.d.name)}</span><div class="track"><div class="fill" style="width:${x.total/max*100}%"></div></div><strong>${number(x.total)}</strong></div>`).join('');
 $('v2Selection').textContent=`${MONTHS[view.month]} · ${rs.length} xodim`;
}
function renderKPI(rs,ds){
 $('kpibars').innerHTML=ds.map(d=>bar(d,rs.filter(r=>r.department===d.code),false)).join('');
 $('kpiRate').textContent=pct(stats(rs).rate);$('kpiDept').textContent=ds.filter(d=>rs.some(r=>r.department===d.code)).length;
 $('kpiTable').innerHTML=ds.map((d,i)=>{const q=stats(rs.filter(r=>r.department===d.code));return `<tr><td>${i+1}</td><td>${esc(d.name)}</td><td>${q.total}</td><td>${q.present}</td><td>${q.absent}</td><td>${pct(q.rate)}</td></tr>`;}).join('');
}
function renderDetail(){
 const rs=detailEmployees(view),base=filteredEmployees(view).filter(r=>!['present','absent'].includes(view.detail)||r.status===view.detail);
 const label={all:'Umumiy xodimlar',present:'Ishdagilar',absent:'Yo‘qlar',hours:'Ish soatlari'}[view.detail];
 $('detailTitle').textContent=label+' — '+(DEPTS.find(d=>d.code===view.department)?.name||'Barcha bo‘limlar');
 $('absenceTitle').textContent=`${rs.length} / ${base.length} xodim · ${view.day}-${MONTHS[view.month].toLowerCase()} 2026`;
 if(!$('employeeBody'))$('employees').innerHTML=`<div class="list-filters"><label>Ism yoki tabel raqami<input id="employeeSearch" placeholder="Ism ёки табель рақами" maxlength="80"></label><label>Smena<select id="tableShift"><option value="">Barcha</option></select></label><label>Holat<select id="tableStatus"><option value="">Barcha</option><option value="present">Ishda</option><option value="absent">Yo‘q</option><option value="rest">Dam olish</option></select></label><label>Oylik soat: dan<input id="minHours" type="number" min="0" max="744" step="1" placeholder="0"></label><label>gacha<input id="maxHours" type="number" min="0" max="744" step="1" placeholder="744"></label></div><div class="employee-scroll"><table class="employee-table"><thead><tr><th>№</th><th>Tab. №</th><th>Xodim nomi</th><th>Bo‘lim</th><th>Smena</th><th>Kod</th><th>Holat</th><th>Kun / soat</th><th>Fond</th><th>Ish soat</th><th>Ortiqcha</th><th>Jami / oy</th></tr></thead><tbody id="employeeBody"></tbody></table></div>`;
 const detailShifts=[...new Set(base.map(r=>r.shift).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uz',{numeric:true}));if(view.tableShift&&!detailShifts.includes(view.tableShift))detailShifts.push(view.tableShift);$('tableShift').innerHTML='<option value="">Barcha</option>'+detailShifts.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
 for(const [id,k] of [['employeeSearch','query'],['tableShift','tableShift'],['tableStatus','tableStatus'],['minHours','minHours'],['maxHours','maxHours']])if(document.activeElement!==$(id))$(id).value=view[k];
 $('employeeBody').innerHTML=rs.map((r,i)=>`<tr data-employee-id="${esc(r.id)}"><td>${i+1}</td><td>${esc(r.tab)}</td><td>${esc(r.name)}</td><td>${esc(r.departmentName)}</td><td>${esc(r.shift)}</td><td>${esc(r.code)}</td><td><span class="pill ${r.status}">${labels[r.status]}</span></td><td>${r.hours}</td><td>${r.fond}</td><td>${r.work}</td><td>${r.overtime}</td><td><b>${r.totalHours}</b></td></tr>`).join('')||'<tr><td colspan="12" class="empty">Filtr bo‘yicha xodim topilmadi. Filtrlarni tozalab ko‘ring.</td></tr>';
}
function change(patch){if(!active||!connected){notify('O‘zgartirish uchun avval shu qurilmaga boshqaruvni oling.');return;}view={...view,...patch};view.day=Math.min(daysInMonth(view.month),Math.max(1,Number(view.day)||1));dirty=true;localVersion++;render();void flush();}
function clearDetail(){return {detail:'',query:'',tableShift:'',tableStatus:'',minHours:'',maxHours:''};}
window.selectDepartment=code=>change({department:code||'',query:''});
window.openEmployeeList=mode=>change({detail:mode,query:'',tableShift:'',tableStatus:'',minHours:'',maxHours:''});
window.goBackFromDetail=()=>change(clearDetail());
for(const [id,key] of [['month','month'],['day','day'],['departmentFilter','department'],['shiftFilter','shift'],['hoursFilter','hours']])$(id).addEventListener('change',e=>change({[key]:['month','day'].includes(key)?Number(e.target.value):e.target.value,...clearDetail()}));
document.querySelectorAll('.nav [data-page]').forEach(el=>el.addEventListener('click',()=>change({page:Number(el.dataset.page),...clearDetail()})));
$('resetFilters').addEventListener('click',()=>change({department:'',shift:'',hours:'',...clearDetail()}));
document.querySelector('.main').addEventListener('click',e=>{
 const list=e.target.closest('[data-list]'),hours=e.target.closest('[data-hours-dept]'),d=e.target.closest('[data-department]');
 if(list)change({department:list.dataset.listDept,detail:list.dataset.list,...{query:'',tableShift:'',tableStatus:'',minHours:'',maxHours:''}});
 else if(hours)change({department:hours.dataset.hoursDept,detail:'hours',tableShift:hours.dataset.hoursShift,query:'',tableStatus:'',minHours:'',maxHours:''});
 else if(d)change({department:d.dataset.department,query:''});
});
document.querySelector('.main').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-department]')){e.preventDefault();e.target.click();}});
for(const el of document.querySelectorAll('.kpi.clickable')){el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();el.click();}});}
$('employees').addEventListener('input',e=>{const key={employeeSearch:'query',tableShift:'tableShift',tableStatus:'tableStatus',minHours:'minHours',maxHours:'maxHours'}[e.target.id];if(key){const val=e.target.value;if(['minHours','maxHours'].includes(key)&&val!==''&&(Number(val)<0||Number(val)>744))return;change({[key]:val});}});
$('adminOpen').textContent='⚙ Boshqaruv';$('adminOpen').addEventListener('click',()=>$('settingsDialog').showModal());$('closeSettings').addEventListener('click',()=>$('settingsDialog').close());
$('full').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('Bu brauzerda to‘liq ekran qo‘llanmaydi.');}catch{notify('To‘liq ekran ochilmadi. Brauzer ruxsatini tekshiring.');}});
$('deviceRole').addEventListener('change',()=>{role=$('deviceRole').value;active=false;dirty=false;remote=null;url.searchParams.set('mode',role);history.replaceState({},'',url);uiPermissions();void poll();});
function headers(){return {'Content-Type':'application/json','X-Dashboard-Role':role,'X-Dashboard-Device':clientId};}
async function request(body){const response=await fetch('/api/state',{method:body?'POST':'GET',headers:headers(),body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(7000)});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Ulanish xatosi.'),{status:response.status});return data;}
function accept(data,force=false){
 const oldEpoch=remote?.epoch;remote=data;connected=true;active=Boolean(data.isController ?? data.active);
 if(!active||(oldEpoch!==undefined&&oldEpoch!==data.epoch)){dirty=false;}
 if(force||!dirty&&!busy){if(JSON.stringify(view)!==JSON.stringify(data.view)){view={...data.view};render();}}
 uiPermissions();
}
async function flush(){
 if(busy||!dirty||!active||!connected)return;busy=true;uiPermissions();
 const seq=localVersion,payload={...view},epoch=remote.epoch;
 try{const data=await request({action:'update',view:payload,epoch});if(seq===localVersion)dirty=false;accept(data);}
 catch(e){if(e.status===409){dirty=false;active=false;notify(e.message);}else{connected=false;active=false;notify('O‘zgarish monitorga yuborilmadi. Aloqa tiklangach serverdagi holat yuklanadi.');dirty=false;}}
 finally{busy=false;uiPermissions();if(dirty)void flush();else if(!active)void poll();}
}
async function action(action){if(busy)return;busy=true;uiPermissions();try{const data=await request({action,epoch:remote?.epoch});dirty=false;accept(data,true);notify(action==='release'?'Boshqaruv kompyuterga qaytarildi.':'Boshqaruv shu qurilmaga o‘tdi.');}catch(e){notify(e.message);if(!e.status)connected=false;}finally{busy=false;uiPermissions();}}
$('claim').addEventListener('click',()=>action('claim'));$('release').addEventListener('click',()=>action('release'));
async function poll(){if(pollBusy||busy)return;pollBusy=true;const currentRole=role;try{let data=await request();if(currentRole===role)accept(data);if(role==='computer'&&data.source==='computer'&&!active){data=await request({action:'claim',epoch:data.epoch});if(currentRole===role)accept(data,true);}if(active&&role==='phone'&&Date.now()-lastHeartbeat>5000){lastHeartbeat=Date.now();const data=await request({action:'heartbeat',epoch:remote.epoch});if(currentRole===role)accept(data);}}catch(e){connected=false;active=false;uiPermissions();}finally{pollBusy=false;}}
async function syncData(){
 if(dataBusy)return;dataBusy=true;
 try{
  let data=null;
  let live=false;

  try{
   const response=await fetch('/api/google-data',{cache:'no-store',signal:AbortSignal.timeout(18000)});
   const candidate=await response.json();
   if(!response.ok||!Array.isArray(candidate.records)||!candidate.records.length){
    throw Error(candidate.error||'Cloud Google Sheets ulanish xatosi.');
   }
   data=candidate;
   live=true;
  }catch(cloudError){
   const response=await fetch('/api/data',{cache:'no-store',signal:AbortSignal.timeout(12000)});
   const candidate=await response.json();
   if(!response.ok||!Array.isArray(candidate.records)||!candidate.records.length){
    throw Error(candidate.error||cloudError.message||'Server ulanish xatosi.');
   }
   data=candidate;
   live=false;
  }

  setLiveRecords(data.records);
  dataOnline=true;

  const stamp=data.refreshedAt
   ? new Date(data.refreshedAt).toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
   : '';

  if(live){
   $('dataStatus').textContent=`Google Sheets: ulangan${stamp?' · '+stamp:''}`;
   $('dataStatus').className='status live';
   $('sourceTag').textContent='GOOGLE SHEETS LIVE';
   $('sourceTag').className='live-tag';
  }else{
   $('dataStatus').textContent=`Google Sheets vaqtincha ulanmagan · zaxira ma’lumot${stamp?' · '+stamp:''}`;
   $('dataStatus').className='status offline';
   $('sourceTag').textContent='ZAXIRA MA’LUMOT';
   $('sourceTag').className='offline';
  }

  render();
 }
 catch(e){
  const hadData=dataOnline;
  dataOnline=false;
  $('dataStatus').textContent='Google Sheets: ulanish xatosi · '+(hadData?'oxirgi olingan ma’lumot saqlandi':'qayta urinilmoqda');
  $('dataStatus').className='status offline';
  $('sourceTag').textContent=hadData?'OXIRGI MA’LUMOT':'YANGILANISH TO‘XTADI';
  $('sourceTag').className='offline';
  if(!$('total').textContent||$('total').textContent==='—')render();
 }
 finally{dataBusy=false;}
}
window.addEventListener('online',()=>void poll());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();});
render();void syncData();void poll();setInterval(syncData,15000);setInterval(poll,700);
