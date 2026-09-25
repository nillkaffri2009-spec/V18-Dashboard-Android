#!/usr/bin/env python3
from __future__ import annotations
import json, shutil, urllib.request, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"release_full"
NAME="V20_ASOSIY_3_FINAL_18_PHONE_CONTROL_FIXED"
PKG=OUT/NAME
CLOUD="https://v18-dashboard-server.nill-kaffri-2009.workers.dev"

def write(path,text):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text.replace("\\r\\n","\\n"),encoding="utf-8")

def copytree(src,dst):
    if dst.exists(): shutil.rmtree(dst)
    shutil.copytree(src,dst,ignore=shutil.ignore_patterns(".wrangler","__pycache__","*.pyc"))

def snapshot():
    req=urllib.request.Request(CLOUD+"/api/google-data?_package=final16",headers={"Cache-Control":"no-cache","User-Agent":"Mamuriyat-Final16-Packager"})
    with urllib.request.urlopen(req,timeout=90) as r: data=json.loads(r.read().decode("utf-8"))
    if not isinstance(data,dict) or not data.get("records"): raise RuntimeError("Live Google snapshot empty")
    return data

if OUT.exists(): shutil.rmtree(OUT)
PKG.mkdir(parents=True)
data=snapshot()

# FINAL 12 style: runnable files are directly in ZIP root.
copytree(ROOT/"worker"/"public",PKG/"web")
(PKG/"web"/"data.json").write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
(PKG/"data.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
(PKG/"state.json").write_text(json.dumps({
  "source":"computer","epoch":1,"revision":1,"updatedAt":0,"phoneUntil":0,
  "devices":{"computer":{"owner":"","view":None},"phone":{"owner":"","view":None},"monitor":{"owner":"","view":None}}
},ensure_ascii=False,indent=2),encoding="utf-8")

server=r'''#!/usr/bin/env python3
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.request import Request,urlopen
from pathlib import Path
from threading import RLock,Thread
from urllib.parse import urlsplit
import json,os,time,socket

BASE=Path(__file__).resolve().parent
WEB=BASE/"web"
STATE_FILE=BASE/"state.json"
DATA_FILE=BASE/"data.json"
CLOUD="https://v18-dashboard-server.nill-kaffri-2009.workers.dev"
HOST="0.0.0.0"
PORT=5000
lock=RLock()

DEFAULT_VIEW={"month":0,"day":1,"page":1,"department":"","shift":"","hours":"","detail":"","query":"","tableShift":"","tableStatus":"","minHours":"","maxHours":"","scrollRatio":0,"rosterScrollRatio":0,"employeeScrollRatio":0,"deptTableScrollRatio":0,"kpiTableScrollRatio":0}

def load_json(p,default):
    try:return json.loads(p.read_text(encoding="utf-8"))
    except:return default

state=load_json(STATE_FILE,{"source":"computer","epoch":1,"revision":1,"updatedAt":0,"phoneUntil":0,"devices":{"computer":{"owner":"","view":None},"phone":{"owner":"","view":None},"monitor":{"owner":"","view":None}}})
cache=load_json(DATA_FILE,{"records":[],"source":"local-snapshot","errors":[]})

def save_state():
    STATE_FILE.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")

def save_data():
    DATA_FILE.write_text(json.dumps(cache,ensure_ascii=False,indent=2),encoding="utf-8")
    (WEB/"data.json").write_text(json.dumps(cache,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

def local_ip():
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.connect(("8.8.8.8",80));ip=s.getsockname()[0];s.close();return ip
    except:return "PC_IP"

def clean_view(v):
    out=dict(DEFAULT_VIEW)
    if isinstance(v,dict):
        for k in out:
            if k in v: out[k]=v[k]
    return out

def expire():
    if state.get("source")=="phone" and state.get("phoneUntil",0)<int(time.time()*1000):
        state["source"]="computer";state["phoneUntil"]=0;state["epoch"]=state.get("epoch",1)+1;state["revision"]=state.get("revision",1)+1;save_state()

def public(role,cid):
    expire();src=state.get("source","computer")
    dev=state.setdefault("devices",{}).setdefault(src,{"owner":"","view":None})
    roledev=state["devices"].setdefault(role,{"owner":"","view":None})
    active=src==role and roledev.get("owner","")==cid
    return {"source":src,"epoch":state.get("epoch",1),"revision":state.get("revision",1),"updatedAt":state.get("updatedAt",0),"view":clean_view(dev.get("view")),"active":active,"isController":active,"hasController":bool(dev.get("owner"))}

def refresh_loop():
    global cache
    while True:
        try:
            req=Request(CLOUD+"/api/google-data?_lan="+str(int(time.time())),headers={"Cache-Control":"no-cache","User-Agent":"Mamuriyat-Local-Final16"})
            with urlopen(req,timeout=7) as r:
                d=json.loads(r.read().decode("utf-8"))
            if isinstance(d,dict) and isinstance(d.get("records"),list) and d["records"]:
                with lock: cache=d;save_data()
        except: pass
        time.sleep(2)

class H(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(WEB),**kw)
    def log_message(self,fmt,*args): pass
    def end_headers(self):
        self.send_header("Cache-Control","no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma","no-cache");self.send_header("Expires","0")
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Headers","Content-Type, X-Dashboard-Role, X-Dashboard-Device")
        self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS")
        super().end_headers()
    def send_json(self,obj,status=200):
        raw=json.dumps(obj,ensure_ascii=False).encode("utf-8")
        self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(raw)));self.end_headers();self.wfile.write(raw)
    def role(self): return self.headers.get("X-Dashboard-Role","computer")
    def cid(self): return self.headers.get("X-Dashboard-Device","")
    def do_OPTIONS(self): self.send_response(204);self.end_headers()
    def do_GET(self):
        p=urlsplit(self.path).path
        if p=="/api/health": return self.send_json({"ok":True,"version":"20.7-cloud","assetVersion":"20.7-final16","service":"V20 FINAL16 LOCAL/LAN"})
        if p in ("/api/google-data","/api/data"):
            with lock:return self.send_json(cache)
        if p=="/api/google-test":
            with lock:return self.send_json({"ok":bool(cache.get("records")),"totalRecords":len(cache.get("records",[])),"source":cache.get("source","local-snapshot"),"errors":cache.get("errors",[])})
        if p=="/api/state":
            with lock:return self.send_json(public(self.role(),self.cid()))
        if p in ("/","/admin","/monitor","/phone","/tv"):
            self.path="/index.html"
        return super().do_GET()
    def do_POST(self):
        p=urlsplit(self.path).path
        if p!="/api/state": return self.send_json({"error":"Not found"},404)
        n=int(self.headers.get("Content-Length","0") or "0")
        try:body=json.loads(self.rfile.read(n) or b"{}")
        except:body={}
        role,cid=self.role(),self.cid()
        if role=="monitor" or not cid:return self.send_json({"error":"Monitor faqat ko‘rsatadi."},403)
        now=int(time.time()*1000)
        with lock:
            expire();action=body.get("action")
            if action=="claim":
                src=state.get("source","computer");owner=state["devices"].setdefault(src,{"owner":"","view":None}).get("owner","")
                if body.get("onlyIfUnowned") and owner:return self.send_json({"error":"Boshqaruv boshqa qurilmada."},409)
                prev=clean_view(state["devices"].setdefault(src,{"owner":"","view":None}).get("view"))
                state["source"]=role;dev=state["devices"].setdefault(role,{"owner":"","view":None});dev["owner"]=cid
                if not dev.get("view"):dev["view"]=prev
                state["epoch"]=state.get("epoch",1)+1;state["revision"]=state.get("revision",1)+1;state["updatedAt"]=now
                state["phoneUntil"]=now+25000 if role=="phone" else 0
            else:
                dev=state["devices"].setdefault(role,{"owner":"","view":None})
                if state.get("source")!=role or dev.get("owner","")!=cid or int(body.get("epoch",-1))!=int(state.get("epoch",1)):
                    return self.send_json({"error":"Boshqaruv boshqa qurilmada. Holat yangilanadi."},409)
                if action=="update":
                    dev["view"]=clean_view(body.get("view"));state["revision"]=state.get("revision",1)+1;state["updatedAt"]=now
                    if role=="phone":state["phoneUntil"]=now+25000
                elif action=="heartbeat" and role=="phone":state["phoneUntil"]=now+25000
                elif action=="release" and role=="phone":
                    state["source"]="computer";state["epoch"]=state.get("epoch",1)+1;state["revision"]=state.get("revision",1)+1;state["phoneUntil"]=0;state["updatedAt"]=now
                else:return self.send_json({"error":"Noma’lum action."},400)
            save_state();return self.send_json(public(role,cid))

Thread(target=refresh_loop,daemon=True).start()
ip=local_ip()
print("="*62)
print(" MAMURIYAT DASHBOARD — FINAL 12 START PRINCIPI / FINAL 16")
print("="*62)
print(f" Admin   : http://127.0.0.1:{PORT}/admin?mode=computer")
print(f" Monitor : http://127.0.0.1:{PORT}/monitor?mode=monitor&tv=43")
print(f" Telefon : http://{ip}:{PORT}/phone?mode=phone")
print(f" TV/LAN  : http://{ip}:{PORT}/monitor?mode=monitor&tv=43")
print(" Snapshot darhol ishlaydi; internet bo‘lsa Google LIVE 2 soniyada yangilanadi.")
print("="*62)
ThreadingHTTPServer((HOST,PORT),H).serve_forever()
'''
write(PKG/"server.py",server)

redir='''<!doctype html><meta charset="utf-8"><script>location.replace("{route}")</script>'''
for fn,route in [
 ("admin.html",f"{CLOUD}/admin?mode=computer&take_control=1"),
 ("monitor.html",f"{CLOUD}/monitor?mode=monitor&tv=43"),
 ("phone.html",f"{CLOUD}/phone?mode=phone&take_control=1"),
 ("Dashboard_GoogleSheets.html",f"{CLOUD}/admin?mode=computer&take_control=1"),
 ("DashBoard_index.html",f"{CLOUD}/admin?mode=computer&take_control=1")]:
    write(PKG/fn,redir.format(route=route))

write(PKG/"START_ALL.bat",f'''@echo off
chcp 65001 >nul
cd /d "%~dp0"
taskkill /FI "WINDOWTITLE eq MAMURIYAT_SERVER*" /T /F >nul 2>nul

REM Local server only stays as a backup/snapshot source.
where py >nul 2>nul
if %errorlevel%==0 (
 start "MAMURIYAT_SERVER" /min cmd /k "title MAMURIYAT_SERVER & py -3 server.py"
) else (
 start "MAMURIYAT_SERVER" /min cmd /k "title MAMURIYAT_SERVER & python server.py"
)
timeout /t 2 /nobreak >nul

REM IMPORTANT: Admin opens on the SAME Cloudflare state used by the 43-inch monitor.
start "" "{CLOUD}/admin?mode=computer&take_control=1"

echo.
echo ============================================================
echo  FINAL 18: ADMIN + MONITOR BIR XIL CLOUD STATE
echo ============================================================
echo  PC Admin ochildi:
echo  {CLOUD}/admin?mode=computer
echo.
echo  43 dyuym monitor eski saqlangan linkda qoladi:
echo  {CLOUD}/monitor?mode=monitor
echo.
echo  Monitor brauzerini yopish shart emas.
echo  Agar eski kesh ko'rinsa bir marta Ctrl+F5 bosing.
echo ============================================================
timeout /t 6 /nobreak >nul
''')
write(PKG/"START_MONITOR_43_CLOUD.bat",f'''@echo off
start "" "{CLOUD}/monitor?mode=monitor&tv=43"
''')
write(PKG/"START_LOCAL_LAN_FALLBACK.bat",r'''@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
 start "MAMURIYAT_SERVER" /min cmd /k "title MAMURIYAT_SERVER & py -3 server.py"
) else (
 start "MAMURIYAT_SERVER" /min cmd /k "title MAMURIYAT_SERVER & python server.py"
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5000/admin?mode=computer"
start "" "http://127.0.0.1:5000/monitor?mode=monitor&tv=43"
''' )
write(PKG/"START_PHONE.bat",f'''@echo off
start "" "{CLOUD}/phone?mode=phone&take_control=1"
''')
write(PKG/"START_CLOUD.bat",f'''@echo off
start "" "{CLOUD}/admin?mode=computer"
start "" "{CLOUD}/monitor?mode=monitor&tv=43"
''')
write(PKG/"STOP_ALL.bat",r'''@echo off
taskkill /FI "WINDOWTITLE eq MAMURIYAT_SERVER*" /T /F >nul 2>nul
echo Mamuriyat server yopildi.
timeout /t 2 /nobreak >nul
''')
write(PKG/"SHOW_IP.bat",r'''@echo off
chcp 65001 >nul
ipconfig | findstr /R /C:"IPv4"
echo.
echo Telefon: http://PC_IP:5000/phone?mode=phone
echo Monitor: http://PC_IP:5000/monitor?mode=monitor&tv=43
timeout /t 12 /nobreak
''')
write(PKG/"CHECK_NETWORK.bat",r'''@echo off
chcp 65001 >nul
echo ===== LOCAL SERVER =====
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5000/api/health -TimeoutSec 5).Content}catch{Write-Host $_}"
echo.
echo ===== IPv4 =====
ipconfig | findstr /R /C:"IPv4"
pause
''')
write(PKG/"PHONE_MONITOR.txt",f'''FINAL 12 START PRINCIPI — FINAL 18

LOCAL ADMIN:
http://127.0.0.1:5000/admin?mode=computer

LOCAL 43 TV:
http://127.0.0.1:5000/monitor?mode=monitor&tv=43

LAN PHONE:
http://PC_IP:5000/phone?mode=phone

LAN 43 TV:
http://PC_IP:5000/monitor?mode=monitor&tv=43

CLOUD ADMIN:
{CLOUD}/admin?mode=computer
CLOUD 43 TV:
{CLOUD}/monitor?mode=monitor&tv=43

MUHIM:
START_ALL PC Adminni shu Cloudflare state'ga ulaydi.
Shuning uchun monitor workers.dev linkda turgan bo'lsa, Admin o'zgarishi monitorga tushadi.
''')
write(PKG/"MONITOR_DOIMIY_LINK.txt",f'''43 DYUYM MONITOR — DOIMIY LINK

{CLOUD}/monitor?mode=monitor

43 dyuym aniq profil:
{CLOUD}/monitor?mode=monitor&tv=43

Bu linkni monitor brauzerida saqlab qo'ying.
Keyingi START_ALL shu monitor bilan bir xil Cloudflare state'da ishlaydi.
''')

# Source/backup materials are kept separate; root remains simple to use.
src=PKG/"_SOURCE"
copytree(ROOT/"worker",src/"worker")
copytree(ROOT/"tests",src/"tests")
(src/".github"/"workflows").mkdir(parents=True,exist_ok=True)
for p in (ROOT/".github"/"workflows").glob("*.yml"):shutil.copy2(p,src/".github"/"workflows"/p.name)
for old in ["V18_ASOSIY_DESIGN_2_CONTROL_SYNC_FIXED.zip","V18_GOOGLE_SHEETS_FINAL_FIXED.zip","V18_KUNLIK_DAVOMAD_PC_MONITOR_PHONE_FIXED.zip"]:
    if (ROOT/old).exists():shutil.copy2(ROOT/old,src/old)

write(PKG/"README_UZ.txt",f'''V20_ASOSIY_3_FINAL_18_PHONE_CONTROL_FIXED

ISHGA TUSHIRISH:
1. ZIPni oching.
2. START_ALL.bat ni ikki marta bosing.
3. PC Admin Cloudflare'dagi shu bitta umumiy state'ga ulanadi va boshqaruvni avtomatik oladi.
4. 43" monitor avvaldan saqlangan workers.dev linkda ochiq qoladi — qayta link almashtirish shart emas.
5. Telefon uchun START_PHONE.bat ishlating.
6. Internet uzilsa START_LOCAL_LAN_FALLBACK.bat orqali LAN rejimidan foydalaning.

ASOSIY QOIDALAR:
- FINAL 12 qulayligi saqlandi: bitta START_ALL.
- Asosiy ish rejimi: PC Admin + Telefon + 43" Monitor bir xil Cloudflare state'da.
- Telefon ochilishi bilan boshqaruvni avtomatik oladi; PC kuzatuvga o'tadi.
- Telefonda "Kompyuterga qaytarish" bilan boshqaruv PCga qaytadi.
- Local port 5000 faqat zaxira/LAN fallback uchun.
- Kunlik davomad asosiy ekran.
- Ish soatlari va KPI alohida.
- Monitor faqat ko‘rish.
- PC ↔ Telefon boshqaruvi.
- Scroll mirror.
- ↻ Обновление tugmasi.
- Google Sheets 2 soniyada tekshiriladi.
- Internet bo‘lmasa DATA snapshot darhol ishlaydi.
- 43" monitor profili 2 metr masofa uchun balanslangan.
- Saqlangan Cloud monitor URL o‘zgarmaydi va START_ALL bilan aynan shu state boshqariladi.

CLOUD:
{CLOUD}
''')
(PKG/"VERSION_INFO.json").write_text(json.dumps({"package":NAME,"version":"20.8-final18-phone-control","records":len(data.get("records",[])),"source":data.get("source"),"refreshedAt":data.get("refreshedAt"),"port":5000,"tvDefault":43,"syncMode":"cloud-shared-state","localFallbackPort":5000},ensure_ascii=False,indent=2),encoding="utf-8")

zip_path=OUT/(NAME+".zip")
with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED,allowZip64=True) as z:
    for p in PKG.rglob("*"):
        if p.is_file():z.write(p,p.relative_to(OUT))
with zipfile.ZipFile(zip_path) as z:
    bad=z.testzip()
    if bad:raise RuntimeError("ZIP error: "+bad)
print(zip_path)
print("records",len(data.get("records",[])))
