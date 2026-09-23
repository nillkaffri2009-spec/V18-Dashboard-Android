export const MONTHS=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

export const DEPTS=[
 ['21010','Tibbiy qism','21010 Tibbiy qism (16)'],
 ['21111','Farroshlar','21111 Farroshlar (65)'],
 ['21113','Bog‘bonlar','21113 Bog‘bonlar (36)'],
 ['21120','Umumiy ovqatlanish','21120 Umumiy ovqatlanish (200)'],
 ['21130','Oziq-ovqat ta’minoti','21130 Oziq-ovqat ta‘minoti (8)'],
 ['21140','Yotoqxona majmuasi','21140 Yotoqxona majmuasi (17)']
].map(([code,name,sheet])=>({code,name,sheet}));

const now=new Date();
export const DEFAULT_VIEW={month:now.getFullYear()===2026?now.getMonth():0,day:now.getFullYear()===2026?now.getDate():1,page:1,department:'',shift:'',hours:'',detail:'',query:'',tableShift:'',tableStatus:'',minHours:'',maxHours:''};
let liveRecords=[];

export const daysInMonth=m=>new Date(2026,m+1,0).getDate();
export const setLiveRecords=records=>{liveRecords=Array.isArray(records)?records:[];};
export const getLiveRecords=()=>liveRecords;

export function validateView(v){
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Ko‘rinish noto‘g‘ri.');
 const out={...DEFAULT_VIEW};
 for(const k of Object.keys(out)){
  if(!(k in v))continue;
  if(['month','day','page'].includes(k)){if(!Number.isInteger(v[k]))throw Error('Sana noto‘g‘ri.');out[k]=v[k];}
  else {if(typeof v[k]!=='string'||v[k].length>(k==='query'?80:30))throw Error('Filtr noto‘g‘ri.');out[k]=v[k];}
 }
 if(out.month<0||out.month>11||out.day<1||out.day>daysInMonth(out.month)||out.page<1||out.page>3)throw Error('Sana yoki sahifa noto‘g‘ri.');
 if(!['',...DEPTS.map(x=>x.code)].includes(out.department)||!['','0','under8','8','over8'].includes(out.hours)||!['','all','present','absent','hours'].includes(out.detail)||!['','present','absent','rest','unknown'].includes(out.tableStatus))throw Error('Filtr qiymati noto‘g‘ri.');
 for(const k of ['shift','tableShift'])if(out[k]&&!/^[\p{L}\p{N} ._\/-]{1,30}$/u.test(out[k]))throw Error('Smena noto‘g‘ri.');
 for(const k of ['minHours','maxHours'])if(out[k]!==''&&(!/^\d+(\.\d+)?$/.test(out[k])||Number(out[k])>744))throw Error('Soat chegarasi noto‘g‘ri.');
 return out;
}

function number(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0;}
function dayInfo(raw){
 const code=String(raw??'').trim().toUpperCase();
 const match=code.match(/^([0-9]+(?:[.,][0-9]+)?)/);const hours=match?number(match[1]):0;
 const status=hours>0||(/[DN]$/.test(code)&&match)?'present':code===''?'unknown':code==='V'?'rest':'absent';
 return {code:code||'—',hours,status};
}

export function employees(v){
 const month=MONTHS[v.month];
 return liveRecords.filter(r=>String(r.m).trim()===month).map((r,index)=>{
  const department=String(r.d??'').trim();const meta=DEPTS.find(d=>d.code===department);
  const daily=dayInfo(Array.isArray(r.day)?r.day[v.day-1]:null);
  const work=number(r.j),overtime=number(r.x),fond=number(r.g);
  return {id:`${department}-${r.tab||index}`,tab:String(r.tab??''),name:String(r.e??''),department,departmentName:meta?.name||department,shift:String(r.s??'').trim(),...daily,work,overtime,fond,totalHours:work+overtime};
 });
}

export function filteredEmployees(v,ignoreDepartment=false){return employees(v).filter(r=>(ignoreDepartment||!v.department||r.department===v.department)&&(!v.shift||r.shift===v.shift)&&(!v.hours||(v.hours==='0'?r.hours===0:v.hours==='8'?r.hours===8:v.hours==='under8'?r.hours>0&&r.hours<8:r.hours>8)));}
export function detailEmployees(v){let rs=filteredEmployees(v);if(['present','absent'].includes(v.detail))rs=rs.filter(r=>r.status===v.detail);const q=v.query.trim().toLowerCase();return rs.filter(r=>(!q||`${r.name} ${r.tab} ${r.departmentName}`.toLowerCase().includes(q))&&(!v.tableShift||r.shift===v.tableShift)&&(!v.tableStatus||r.status===v.tableStatus)&&(v.minHours===''||r.totalHours>=Number(v.minHours))&&(v.maxHours===''||r.totalHours<=Number(v.maxHours))).sort((a,b)=>v.detail==='hours'?b.totalHours-a.totalHours:a.department.localeCompare(b.department,'uz')||a.name.localeCompare(b.name,'uz'));}
export function stats(rs){const present=rs.filter(r=>r.status==='present').length,absent=rs.filter(r=>r.status==='absent').length,rest=rs.filter(r=>r.status==='rest').length;return {total:rs.length,present,absent,rest,rate:present+absent?present/(present+absent)*100:null};}
export function shiftsFor(v){return [...new Set(employees(v).filter(r=>!v.department||r.department===v.department).map(r=>r.shift).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uz',{numeric:true}));}

export function availableMonths(){return MONTHS.map((_,i)=>i).filter(i=>liveRecords.some(r=>r.m===MONTHS[i]));}
export function recommendedMonth(){
 const available=availableMonths();const complete=available.filter(i=>DEPTS.every(d=>liveRecords.some(r=>r.m===MONTHS[i]&&r.d===d.code)));
 return complete.at(-1)??available.at(-1)??null;
}
