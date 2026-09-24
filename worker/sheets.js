export const SPREADSHEET_ID = '1IWyUdorge58MbvpNlB5Z08Rawm8AdoeHinxgjiFktF4';
export const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
export const SHEETS = [
  {code:'21010',gid:1701842361,name:'21010 Tibbiy qism (16)'},
  {code:'21111',gid:41187103,name:'21111 Farroshlar (65)'},
  {code:'21113',gid:2025596736,name:'21113 Bog‘bonlar (36)'},
  {code:'21120',gid:484675162,name:'21120 Umumiy ovqatlanish (200)'},
  {code:'21130',gid:1444812925,name:'21130 Oziq-ovqat ta‘minoti (8)'},
  {code:'21140',gid:695944175,name:'21140 Yotoqxona majmuasi (17)'}
];

// CSV preserves mixed numeric/text table numbers and day codes (GViz infers types).
export function parseCSV(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {
      if(c==='"' && text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"')quoted=false;
      else cell+=c;
    } else if(c==='"' && !cell)quoted=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);rows.push(row);row=[];cell='';
    } else cell+=c;
  }
  if(quoted)throw Error('CSV qatori tugallanmagan');
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
const aliases=[['yanvar','январь','январ'],['fevral','февраль','феврал'],['mart','март'],['aprel','апрель','апрел'],['may','май'],['iyun','июнь','июн'],['iyul','июль','июл'],['avgust','август'],['sentabr','sentyabr','сентябрь','сентябр'],['oktabr','oktyabr','октябрь','октябр'],['noyabr','ноябрь','ноябр'],['dekabr','декабрь','декабр']];
export function monthName(value) {
  const raw=String(value??'').trim().toLowerCase();
  const i=aliases.findIndex(a=>a.includes(raw));return i<0?'':MONTHS[i];
}
const numeric=v=>{const n=Number(String(v??'').replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0;};
export function normalizeRows(rows,expectedCode) {
  let month='',dept='';const unique=new Map();
  rows.forEach((c,i)=>{
    c=c||[];const m=monthName(c[1]);if(m)month=m;
    const code=String(c[2]??'').trim();if(/^\d{5}$/.test(code))dept=code;
    const tab=String(c[3]??'').trim(),name=String(c[4]??'').trim();
    if(!month||dept!==String(expectedCode)||!name||/^xodim$/i.test(name)||/^tab\s*no$/i.test(tab)||/^(jami|итого|всего)\b/i.test(name))return;
    const record={m:month,d:dept,e:name,tab,sourceRow:i+1,s:String(c[5]??'').trim(),g:numeric(c[6]),j:numeric(c[9]),x:numeric(c[12]),day:Array.from({length:31},(_,n)=>c[n+14]??null)};
    // Duplicate month blocks exist in the source; keep the later copy for one employee.
    const key=[month,dept,tab||name,name].join('|');unique.set(key,record);
  });
  return [...unique.values()];
}
function parseGviz(text) {
  const a=String(text).indexOf('{'),b=String(text).lastIndexOf('}');
  if(a<0||b<a)throw Error('Google GViz javobi noto‘g‘ri');
  return JSON.parse(String(text).slice(a,b+1));
}
function gvizValue(cell){return cell?.v??cell?.f??null;}
export function normalizeGviz(obj,expectedCode) {
  const rows=obj?.table?.rows||[],raw=rows.map(r=>(r?.c||[]).map(gvizValue));
  return normalizeRows(raw,expectedCode);
}
async function fetchRecords(fetcher,sheet,now) {
  const base=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;
  const options={cf:{cacheTtl:0,cacheEverything:false}};
  const errors=[];
  try{
    const url=`${base}/export?format=csv&gid=${sheet.gid}&_v20=${Math.floor(now/2000)}`;
    const response=await fetcher(url,options);
    if(!response.ok)throw Error(`CSV HTTP ${response.status}`);
    const text=await response.text();
    if(/^\s*<!doctype html|^\s*<html/i.test(text))throw Error('CSV o‘rniga kirish sahifasi keldi');
    const records=normalizeRows(parseCSV(text),sheet.code);
    if(records.length)return records;
    throw Error('CSV bo‘lim qatorlari topilmadi');
  }catch(e){errors.push(String(e?.message||e));}
  try{
    const url=`${base}/gviz/tq?tqx=out:json&gid=${sheet.gid}&tq=${encodeURIComponent('select *')}&_v20=${Math.floor(now/2000)}`;
    const response=await fetcher(url,options);
    if(!response.ok)throw Error(`GViz HTTP ${response.status}`);
    const records=normalizeGviz(parseGviz(await response.text()),sheet.code);
    if(records.length)return records;
    throw Error('GViz bo‘lim qatorlari topilmadi');
  }catch(e){errors.push(String(e?.message||e));}
  throw Error(errors.join(' | '));
}
export function coverage(records) {
  const counts={};for(const row of records){counts[row.m]??={};counts[row.m][row.d]=(counts[row.m][row.d]||0)+1;}
  const available=MONTHS.map((_,i)=>i).filter(i=>counts[MONTHS[i]]);
  const complete=available.filter(i=>SHEETS.every(s=>counts[MONTHS[i]][s.code]>0));
  return {counts,availableMonths:available,latestMonth:available.at(-1)??null,latestCompleteMonth:complete.at(-1)??null};
}
export class SheetCache {
  constructor(){this.value=null;this.promise=null;this.lastAttempt=0;this.parts=new Map();}
  async get(fetcher=fetch,now=Date.now()) {
    if(this.promise)return this.promise;
    if(this.value&&now-this.lastAttempt<2000)return this.value;
    this.lastAttempt=now;
    this.promise=this.refresh(fetcher,now).finally(()=>{this.promise=null;});
    return this.promise;
  }
  async refresh(fetcher,now) {
    const errors=[],loaded=[];
    await Promise.all(SHEETS.map(async sheet=>{
      try {
        const records=await fetchRecords(fetcher,sheet,now);
        this.parts.set(sheet.code,{records,refreshedAt:new Date().toISOString()});
        loaded.push({code:sheet.code,sheet:sheet.name,records:records.length,stale:false});
      } catch(e) {
        errors.push(`${sheet.code}: ${e.message}`);
        const prior=this.parts.get(sheet.code);
        if(prior)loaded.push({code:sheet.code,sheet:sheet.name,records:prior.records.length,stale:true});
      }
    }));
    const records=SHEETS.flatMap(s=>this.parts.get(s.code)?.records||[]);
    if(!records.length)throw Error('Google Sheets ulanmagan. '+errors.join('; '));
    this.value={records,...coverage(records),refreshedAt:new Date().toISOString(),source:'google-sheets-cloud',pollIntervalMs:2000,loaded,errors,partial:errors.length>0};
    return this.value;
  }
}
