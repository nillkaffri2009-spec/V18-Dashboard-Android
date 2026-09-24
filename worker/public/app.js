import {MONTHS,DEPTS,DEFAULT_VIEW,daysInMonth,setLiveRecords,filteredEmployees,detailEmployees,stats,shiftsFor,getLiveRecords,availableMonths,recommendedMonth} from './model.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('uz-UZ'),pct=n=>n===null?'—':n.toFixed(1)+'%';
const labels={present:'Ishda',absent:'Yo‘q',rest:'Dam olish',unknown:'Kiritilmagan'};
const roleNames={computer:'Admin-kompyuter',phone:'Telefon',monitor:'Monitor'};
const SHEET_ID='1IWyUdorge58MbvpNlB5Z08Rawm8AdoeHinxgjiFktF4';
const CONFIG=window.V20_CONFIG||{};
const APP_BUILD='20.5-cloud';
const isPreview=Boolean(CONFIG.preview);
const apiPath=path=>(CONFIG.apiBase||'').replace(/\/$/,'')+path;
const url=new URL(location.href);
const lockedMonitor=Boolean(CONFIG.lockRole)||['/monitor','/tv'].includes(location.pathname);
let role=lockedMonitor?'monitor':(['computer','phone'].includes(url.searchParams.get('mode'))?url.searchParams.get('mode'):CONFIG.defaultRole||(['V20_PHONE.html','/phone'].some(x=>location.pathname.endsWith(x))||innerWidth<760?'phone':'computer'));
if(!lockedMonitor&&!['computer','phone'].includes(role))role='computer';
const newDeviceId=()=>window.crypto?.randomUUID?.()||`device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
let clientId;try{clientId=sessionStorage.getItem('asosiyDevice');if(!clientId){clientId=newDeviceId();sessionStorage.setItem('asosiyDevice',clientId);}}catch{clientId=newDeviceId();}
let view={...DEFAULT_VIEW},remote=null,connected=false,active=false,busy=false,dirty=false,localVersion=0,lastHeartbeat=0,pollBusy=false,dataBusy=false,dataOnline=false,noticeTimer,initialMonthChosen=false,lastLiveData=null,everLoaded=false,applyingRemoteScroll=false,scrollSendTimers={};
$('deviceRole').value=role;
if(CONFIG.snapshot?.records?.length)setLiveRecords(CONFIG.snapshot.records);
if(isPreview){view={...view,month:CONFIG.previewMonth??6,day:1};$('sourceTag').textContent='ZAXIRA MA’LUMOT · KO‘RINISH';$('sourceTag').className='offline';$('dataStatus').textContent='Dizaynni ko‘rish · ZIP ichidagi saqlangan ma’lumot · LIVE emas';$('versionLabel').textContent='V20.3 · Asosiy 3 · Ko‘rinish';}
else if(CONFIG.snapshot){$('sourceTag').textContent='ZAXIRA · ULANMOQDA';$('sourceTag').className='offline';$('dataStatus').textContent='ZIP ichidagi zaxira ma’lumot · serverga ulanmoqda…';}
$('month').innerHTML=MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('');
$('departmentFilter').innerHTML='<option value="">Barcha bo‘limlar</option>'+DEPTS.map(d=>`<option value="${d.code}">${esc(d.name)}</option>`).join('');
function notify(msg){$('notice').textContent=msg;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',6500);}
function bar(d,rs,selected){const q=stats(rs);return `<div class="barrow ${selected?'selected':''}" data-department="${d.code}" role="button" tabindex="0" aria-label="${esc(d.name)} bo‘limini tanlash"><span>${esc(d.name)}</span><div class="track"><div class="fill" style="width:${q.rate??0}%"></div></div><strong>${pct(q.rate)}</strong></div>`;}
function uiPermissions(){
 const can=isPreview||active&&connected;
 $('deviceRole').disabled=lockedMonitor||isPreview||busy;
 $('adminOpen').textContent=lockedMonitor?'Admin / telefon ↗':'⚙ Boshqaruv';
 if(isPreview){$('claim').hidden=true;$('release').hidden=true;$('connection').textContent='● Faqat mahalliy ko‘rinish';$('connection').className='offline';$('controlSource').textContent='Ko‘rinish: o‘zgarishlar monitorga yuborilmaydi';}

 for(const el of document.querySelectorAll('#month,#day,#globalFilters select,#globalFilters button,#resetFilters,.nav [data-page],#detail input,#detail select'))el.disabled=!can;
 document.querySelector('.main').classList.toggle('read-only',!can);
 document.body.classList.toggle('monitor-mode',role==='monitor');
 document.querySelector('.app').classList.toggle('admin-compact',role==='monitor');
 if(isPreview)return;
 $('claim').hidden=role==='monitor';$('claim').disabled=busy||active;
 $('claim').textContent=active?'Boshqaruv sizda':role==='phone'?'Telefondan boshqaruvni olish':'PKdan boshqaruvni olish';
 $('release').hidden=role!=='phone'||!active;$('release').disabled=busy||!connected;
 $('connection').textContent=connected?'● Ulangan':'● Aloqa yo‘q · qayta urinilmoqda';$('connection').className=connected?'live':'offline';
 $('controlSource').textContent=`Boshqaruv: ${roleNames[remote?.source||'computer']}${role==='monitor'?' · faqat ko‘rish':active?' · sizda':' · kuzatuv'}`;
}
function ratioFor(el){
 if(!el){const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);return max?Math.min(1,Math.max(0,window.scrollY/max)):0;}
 const max=Math.max(0,el.scrollHeight-el.clientHeight);return max?Math.min(1,Math.max(0,el.scrollTop/max)):0;
}
function applyRatio(el,ratio){
 ratio=Number(ratio);if(!Number.isFinite(ratio))return;
 const max=el?Math.max(0,el.scrollHeight-el.clientHeight):Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
 const top=max*Math.min(1,Math.max(0,ratio));
 const current=el?el.scrollTop:window.scrollY;
 if(Math.abs(current-top)<=2)return;
 applyingRemoteScroll=true;
 if(el)el.scrollTop=top;else window.scrollTo(0,top);
 requestAnimationFrame(()=>{applyingRemoteScroll=false;});
}
function applyRemoteScroll(){
 if(isPreview||(active&&role!=='monitor'))return;
 requestAnimationFrame(()=>{
  applyRatio(null,view.scrollRatio);
  applyRatio($('rosterScroll'),view.rosterScrollRatio);
  applyRatio($('employeeScroll'),view.employeeScrollRatio);
  applyRatio($('deptTableScroll'),view.deptTableScrollRatio);
  applyRatio($('kpiTableScroll'),view.kpiTableScrollRatio);
 });
}
function queueScrollField(field,el){
 if(applyingRemoteScroll||lockedMonitor||isPreview||!active||!connected)return;
 clearTimeout(scrollSendTimers[field]);scrollSendTimers[field]=setTimeout(()=>{
  const ratio=ratioFor(el);if(Math.abs(ratio-Number(view[field]||0))<0.002)return;
  view={...view,[field]:ratio};dirty=true;localVersion++;void flush();
 },25);
}
function queueScrollSync(){queueScrollField('scrollRatio',null);}
function render(){
 const monthRows=getLiveRecords().filter(r=>r.m===MONTHS[view.month]);
 const monthAvailable=monthRows.length>0;
 const dataAvailable=monthRows.some(r=>!view.department||r.d===view.department);
 const missing=DEPTS.filter(d=>(!view.department||view.department===d.code)&&!monthRows.some(r=>r.d===d.code));
 $('dataCoverage').hidden=!missing.length;
 $('dataCoverage').textContent=everLoaded||CONFIG.snapshot ? (monthAvailable?`${MONTHS[view.month]}: ${missing.map(d=>d.name).join(', ')} — bu oy kiritilmagan. Faqat mavjud ma’lumot hisoblandi.`:`${MONTHS[view.month]} uchun Google Sheetsda ma’lumot yo‘q. Oxirgi to‘liq oy: ${MONTHS[recommendedMonth()]||'—'}.`) : 'Google Sheets ma’lumotlari yuklanmoqda…';
 $('latestMonth').hidden=!missing.length||lockedMonitor;
 $('latestMonth').disabled=!(isPreview||active&&connected);
 const known=new Set(availableMonths());
 for(const option of $('month').options)option.textContent=MONTHS[Number(option.value)]+(known.has(Number(option.value))?'':' · ma’lumot yo‘q');
 
 $('month').value=view.month;$('day').value=view.day;$('day').max=daysInMonth(view.month);
 $('departmentFilter').value=view.department;$('hoursFilter').value=view.hours;
 const shifts=shiftsFor({...view,shift:''});if(view.shift&&!shifts.includes(view.shift))shifts.push(view.shift);
 $('shiftFilter').innerHTML='<option value="">Barcha smenalar</option>'+shifts.sort((a,b)=>a.localeCompare(b,'uz',{numeric:true})).map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');$('shiftFilter').value=view.shift;
 const all=filteredEmployees(view,true),rs=filteredEmployees(view),q=stats(rs),d=DEPTS.find(x=>x.code===view.department);
 $('sideRows').innerHTML=DEPTS.map(x=>`<div class="side-row ${x.code===view.department?'selected':''}" data-department="${x.code}" role="button" tabindex="0"><div>${x.code}</div><div>${esc(x.name)}</div><div>${all.filter(r=>r.department===x.code).length}</div></div>`).join('')+`<div class="side-row side-total" data-department="" role="button" tabindex="0"><div></div><div>JAMI</div><div>${all.length}</div></div>`;
 $('total').textContent=dataAvailable?q.total:'—';$('present').textContent=dataAvailable&&q.present+q.absent+q.rest>0?q.present:'—';$('absent').textContent=dataAvailable&&q.present+q.absent+q.rest>0?q.absent:'—';$('rate').textContent=pct(q.rate);
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
 renderDailyRoster(rs,ds);renderHours(rs,ds);renderKPI(rs,ds);if(view.detail)renderDetail();uiPermissions();applyRemoteScroll();
}

function renderDailyRoster(rs,ds){
 const shown=[...rs].sort((a,b)=>a.department.localeCompare(b.department)||a.name.localeCompare(b.name,'uz')).slice(0,10);
 $('rosterCount').textContent=`Jami: ${rs.length} ta`;
 $('dailyRoster').innerHTML=shown.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.departmentName)}</td><td>${esc(r.shift)||'—'}</td><td>${r.status==='unknown'?'—':r.hours+' soat'}</td><td><span class="pill ${r.status}">${labels[r.status]}</span></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Tanlangan sana va filtrlar bo‘yicha ma’lumot yo‘q.</td></tr>';
 $('rosterNote').textContent=`${view.day}-${MONTHS[view.month].toLowerCase()} 2026 · ${shown.length} / ${rs.length} xodim. To‘liq ro‘yxat uchun “Barchasi”ni bosing.`;
 const summary=ds.map(d=>({name:d.name,...stats(rs.filter(r=>r.department===d.code))})).filter(d=>d.rate!==null).sort((a,b)=>b.rate-a.rate);
 const high=summary[0],low=summary[summary.length-1],q=stats(rs);
 const items=[['Eng yuqori',pct(high?.rate??null),high?.name||'Ma’lumot yo‘q'],['Eng past',pct(low?.rate??null),low?.name||'Ma’lumot yo‘q'],['O‘rtacha',pct(q.rate),'Davomat'],['Jami bo‘limlar',ds.filter(d=>rs.some(r=>r.department===d.code)).length,'ta']];
 $('miniStats').innerHTML=items.map(([l,n,s])=>`<div><span>${l}</span><strong>${n}</strong><small>${esc(s)}</small></div>`).join('');
}
function updateClock(){const t=new Date();$('clockDate').textContent=t.toLocaleDateString('uz-UZ',{timeZone:'Asia/Tashkent',year:'numeric',month:'short',day:'numeric'});$('clockTime').textContent=t.toLocaleTimeString('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'});}

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
 if(!$('employeeBody'))$('employees').innerHTML=`<div class="list-filters"><label>Ism yoki tabel raqami<input id="employeeSearch" placeholder="Ism ёки табель рақами" maxlength="80"></label><label>Smena<select id="tableShift"><option value="">Barcha</option></select></label><label>Holat<select id="tableStatus"><option value="">Barcha</option><option value="present">Ishda</option><option value="absent">Yo‘q</option><option value="rest">Dam olish</option><option value="unknown">Kiritilmagan</option></select></label><label>Oylik soat: dan<input id="minHours" type="number" min="0" max="744" step="1" placeholder="0"></label><label>gacha<input id="maxHours" type="number" min="0" max="744" step="1" placeholder="744"></label></div><div class="employee-scroll" id="employeeScroll"><table class="employee-table"><thead><tr><th>№</th><th>Tab. №</th><th>Xodim nomi</th><th>Bo‘lim</th><th>Smena</th><th>Kod</th><th>Holat</th><th>Kun / soat</th><th>Fond</th><th>Ish soat</th><th>Ortiqcha</th><th>Jami / oy</th></tr></thead><tbody id="employeeBody"></tbody></table></div>`;
 const detailShifts=[...new Set(base.map(r=>r.shift).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uz',{numeric:true}));if(view.tableShift&&!detailShifts.includes(view.tableShift))detailShifts.push(view.tableShift);$('tableShift').innerHTML='<option value="">Barcha</option>'+detailShifts.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
 for(const [id,k] of [['employeeSearch','query'],['tableShift','tableShift'],['tableStatus','tableStatus'],['minHours','minHours'],['maxHours','maxHours']])if(document.activeElement!==$(id))$(id).value=view[k];
 $('employeeBody').innerHTML=rs.map((r,i)=>`<tr data-employee-id="${esc(r.id)}"><td>${i+1}</td><td>${esc(r.tab)}</td><td>${esc(r.name)}</td><td>${esc(r.departmentName)}</td><td>${esc(r.shift)}</td><td>${esc(r.code)}</td><td><span class="pill ${r.status}">${labels[r.status]}</span></td><td>${r.hours}</td><td>${r.fond}</td><td>${r.work}</td><td>${r.overtime}</td><td><b>${r.totalHours}</b></td></tr>`).join('')||'<tr><td colspan="12" class="empty">Filtr bo‘yicha xodim topilmadi. Filtrlarni tozalab ko‘ring.</td></tr>';
}
function change(patch){if(isPreview){view={...view,...patch};view.day=Math.min(daysInMonth(view.month),Math.max(1,Number(view.day)||1));render();return;}if(!active||!connected){notify('O‘zgartirish uchun avval shu qurilmaga boshqaruvni oling.');return;}view={...view,...patch};view.day=Math.min(daysInMonth(view.month),Math.max(1,Number(view.day)||1));dirty=true;localVersion++;render();void flush();}
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
$('deviceRole').addEventListener('change',()=>{if(lockedMonitor||isPreview)return;role=$('deviceRole').value;active=false;dirty=false;remote=null;url.searchParams.set('mode',role);try{history.replaceState({},'',url);}catch{}uiPermissions();void poll();});
function timeoutSignal(ms){if(typeof AbortSignal!=='undefined'&&AbortSignal.timeout)return AbortSignal.timeout(ms);const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;}
function headers(){return {'Content-Type':'application/json','X-Dashboard-Role':role,'X-Dashboard-Device':clientId};}
async function request(body){const response=await fetch(apiPath('/api/state'),{method:body?'POST':'GET',headers:headers(),body:body?JSON.stringify(body):undefined,cache:'no-store',signal:timeoutSignal(7000)});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Ulanish xatosi.'),{status:response.status});return data;}
function accept(data,force=false){
 if(remote && data.revision<remote.revision)return;
 const oldEpoch=remote?.epoch;remote=data;connected=true;active=Boolean(data.isController ?? data.active);
 if(!active||(oldEpoch!==undefined&&oldEpoch!==data.epoch)){dirty=false;}
 if(force||!dirty&&!busy){const nextView={...DEFAULT_VIEW,...data.view};if(JSON.stringify(view)!==JSON.stringify(nextView)){view=nextView;render();}}
 uiPermissions();
 chooseInitialMonth();
}
async function flush(){
 if(busy||!dirty||!active||!connected)return;busy=true;uiPermissions();
 const seq=localVersion,payload={...view},epoch=remote.epoch;
 try{const data=await request({action:'update',view:payload,epoch});if(seq===localVersion)dirty=false;accept(data);}
 catch(e){if(e.status===409){dirty=false;active=false;notify(e.message);}else{connected=false;active=false;notify('O‘zgarish monitorga yuborilmadi. Aloqa tiklangach serverdagi holat yuklanadi.');dirty=false;}}
 finally{busy=false;uiPermissions();if(dirty)void flush();else if(!active)void poll();}
}
async function action(action){if(busy||lockedMonitor)return;busy=true;uiPermissions();try{const data=await request({action,epoch:remote?.epoch});dirty=false;accept(data,true);notify(action==='release'?'Boshqaruv kompyuterga qaytarildi.':'Boshqaruv shu qurilmaga o‘tdi.');}catch(e){notify(e.message);if(!e.status)connected=false;}finally{busy=false;uiPermissions();if(dirty)void flush();}}
$('claim').addEventListener('click',()=>action('claim'));$('release').addEventListener('click',()=>action('release'));
async function poll(){
 if(pollBusy||busy)return;pollBusy=true;const currentRole=role;
 try{
  let data=await request();if(currentRole!==role)return;accept(data);
  if(role==='computer'&&data.hasController===false){data=await request({action:'claim',onlyIfUnowned:true});if(currentRole===role)accept(data,true);}
  if(active&&role==='phone'&&Date.now()-lastHeartbeat>5000){lastHeartbeat=Date.now();const heartbeat=await request({action:'heartbeat',epoch:remote.epoch});if(currentRole===role)accept(heartbeat);}
 }catch(e){if(currentRole===role){connected=false;active=false;uiPermissions();}}finally{pollBusy=false;}
}
function chooseInitialMonth(){
 if(initialMonthChosen||!everLoaded)return;
 const available=availableMonths();
 if(!available.length||available.includes(Number(view.month))){initialMonthChosen=true;return;}
 const month=recommendedMonth();if(month===null)return;
 if(isPreview||active){initialMonthChosen=true;change({month,day:1});notify(`${MONTHS[month]} ochildi — oxirgi to‘liq ma’lumot. Barcha oylar ro‘yxatda.`);return;}
 if(role==='monitor'&&remote?.hasController===false){initialMonthChosen=true;view={...view,month,day:1};render();notify(`${MONTHS[month]} ochildi — Google Sheetsdagi oxirgi to‘liq oy.`);}
}
$('latestMonth').addEventListener('click',()=>{const month=recommendedMonth();if(month!==null)change({month,day:1,department:'',...clearDetail()});});
async function syncData(){
 if(dataBusy)return;dataBusy=true;
 try{
  const response=await fetch(apiPath('/api/google-data'),{cache:'no-store',signal:timeoutSignal(15000)});
  const data=await response.json();
  if(!response.ok||!Array.isArray(data.records)||!data.records.length)throw Error(data.error||'Google Sheets ulanmagan');
  lastLiveData=data;everLoaded=true;dataOnline=true;setLiveRecords(data.records);
  const stamp=new Date(data.refreshedAt||Date.now()).toLocaleTimeString('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  $('sourceTag').textContent=data.partial?'QISMAN YANGILANDI':'GOOGLE SHEETS · LIVE';$('sourceTag').className=data.partial?'offline':'live-tag';
  $('dataStatus').textContent=`Google Sheets · har 2 soniyada tekshiriladi · ${stamp}`+(data.errors?.length?' · '+data.errors.join('; '):'');$('dataStatus').className=data.partial?'offline':'live';
  render();chooseInitialMonth();
 }catch(e){
  // Never replace newer live records with an older embedded snapshot after an outage.
  if(!everLoaded){
   try{const fallback=CONFIG.snapshot||await (await fetch(apiPath('/api/data'),{cache:'no-store',signal:timeoutSignal(7000)})).json();if(fallback.records?.length){setLiveRecords(fallback.records);everLoaded=true;}}
   catch{}
  }
  dataOnline=false;$('sourceTag').textContent=everLoaded?'OXIRGI MA’LUMOT · OFFLINE':'GOOGLE SHEETS ULANMAGAN';$('sourceTag').className='offline';
  $('dataStatus').textContent=`Ulanish xatosi: ${e.message}. ${everLoaded?'Oxirgi olingan ma’lumot saqlandi.':'Qayta urinilmoqda.'}`;$('dataStatus').className='offline';render();chooseInitialMonth();
 }finally{dataBusy=false;}
}
async function clearLegacyCaches(){
 try{
  if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}
  if('caches' in window){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}
 }catch{}
}
async function checkBuildVersion(){
 if(isPreview)return;
 try{
  const response=await fetch(apiPath('/api/health?_build='+Date.now()),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:timeoutSignal(5000)});
  const data=await response.json();
  if(response.ok&&data.version&&data.version!==APP_BUILD){const next=new URL(location.href);next.searchParams.set('_build',data.version);location.replace(next.toString());}
 }catch{}
}
window.addEventListener('online',()=>{if(!isPreview){void checkBuildVersion();void poll();void syncData();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!isPreview){void checkBuildVersion();void poll();void syncData();}});
window.addEventListener('scroll',queueScrollSync,{passive:true});
document.addEventListener('scroll',e=>{
 const t=e.target;if(!(t instanceof Element))return;
 if(t.id==='rosterScroll')queueScrollField('rosterScrollRatio',t);
 else if(t.id==='employeeScroll')queueScrollField('employeeScrollRatio',t);
 else if(t.id==='deptTableScroll')queueScrollField('deptTableScrollRatio',t);
 else if(t.id==='kpiTableScroll')queueScrollField('kpiTableScrollRatio',t);
},{capture:true,passive:true});
$('manualRefresh').addEventListener('click',async()=>{
 if(lockedMonitor)return;
 const b=$('manualRefresh');b.classList.add('refreshing');b.disabled=true;notify('Ma’lumotlar yangilanmoqda…');
 try{await Promise.all([syncData(),checkBuildVersion()]);notify('Ma’lumotlar yangilandi.');}
 finally{b.classList.remove('refreshing');b.disabled=false;}
});
updateClock();setInterval(updateClock,1000);render();void clearLegacyCaches();
if(!isPreview){void checkBuildVersion();void syncData();if(url.searchParams.get('take_control')==='1'&&!lockedMonitor)void action('claim');else void poll();setInterval(checkBuildVersion,2000);setInterval(syncData,2000);setInterval(()=>{if(role==='monitor')void poll();},250);setInterval(()=>{if(role!=='monitor')void poll();},700);}
