#!/usr/bin/env python3
from __future__ import annotations
import json, os, shutil, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "release_full"
NAME = "V20_ASOSIY_3_FINAL_14_COMPLETE_PACKAGE"
PKG = OUT / NAME
CLOUD = "https://v18-dashboard-server.nill-kaffri-2009.workers.dev"

def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.replace("\r\n","\n"), encoding="utf-8")

def copytree(src: Path, dst: Path):
    if dst.exists(): shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".wrangler","__pycache__","*.pyc"))

def fetch_live_snapshot() -> dict:
    req = urllib.request.Request(CLOUD + "/api/google-data?_package=final14",
                                 headers={"Cache-Control":"no-cache","User-Agent":"Mamuriyat-Final14-Packager"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("records"), list) or not data["records"]:
        raise RuntimeError("Live Google data snapshot is empty")
    return data

if OUT.exists(): shutil.rmtree(OUT)
PKG.mkdir(parents=True)

# 1) Current live Cloudflare Worker source and tests
copytree(ROOT/"worker", PKG/"CLOUDFLARE"/"worker")
copytree(ROOT/"tests", PKG/"TESTS")
(PKG/".github"/"workflows").mkdir(parents=True, exist_ok=True)
for p in (ROOT/".github"/"workflows").glob("*.yml"):
    shutil.copy2(p, PKG/".github"/"workflows"/p.name)

# 2) Current live Google Sheets snapshot (authoritative backup)
snapshot = fetch_live_snapshot()
data_dir = PKG/"DATA"
data_dir.mkdir()
(data_dir/"google_sheets_live_snapshot.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
# Replace stale embedded snapshot in packaged copies.
for target in [
    PKG/"CLOUDFLARE"/"worker"/"public"/"data.json",
]:
    target.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",",":")), encoding="utf-8")

# 3) Local/LAN runnable copy
local = PKG/"LOCAL_LAN"
web = local/"web"
copytree(ROOT/"worker"/"public", web)
(web/"data.json").write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",",":")), encoding="utf-8")

server_py = r'''#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
import os, sys

HOST="0.0.0.0"
PORT=8765
CLOUD="https://v18-dashboard-server.nill-kaffri-2009.workers.dev"
WEB=Path(__file__).resolve().parent/"web"
os.chdir(WEB)

class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control","no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma","no-cache")
        self.send_header("Expires","0")
        super().end_headers()

    def _proxy(self):
        body=None
        if self.command not in ("GET","HEAD"):
            n=int(self.headers.get("Content-Length","0") or "0")
            body=self.rfile.read(n) if n else None
        headers={"Content-Type": self.headers.get("Content-Type","application/json")}
        for k in ("X-Dashboard-Role","X-Dashboard-Device"):
            if self.headers.get(k): headers[k]=self.headers[k]
        req=Request(CLOUD+self.path, data=body, headers=headers, method=self.command)
        try:
            with urlopen(req, timeout=30) as r:
                raw=r.read(); status=r.status; ctype=r.headers.get("Content-Type","application/octet-stream")
        except HTTPError as e:
            raw=e.read(); status=e.code; ctype=e.headers.get("Content-Type","application/json")
        self.send_response(status)
        self.send_header("Content-Type",ctype)
        self.send_header("Cache-Control","no-store")
        self.end_headers()
        if self.command!="HEAD": self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/api/"): return self._proxy()
        path=self.path.split("?",1)[0]
        if path in ("/","/admin","/monitor","/phone","/tv"):
            self.path="/index.html"
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"): return self._proxy()
        self.send_error(405)

print(f"Mamuriyat Dashboard LOCAL/LAN: http://127.0.0.1:{PORT}/admin?mode=computer")
print("Phone/Monitor uchun SHOW_IP.bat orqali IPv4 ni ko'ring.")
ThreadingHTTPServer((HOST,PORT),H).serve_forever()
'''
write(local/"server.py", server_py)

state = {
  "source":"computer","epoch":1,"revision":1,"updatedAt":0,
  "devices":{"computer":{"owner":"","view":None},"phone":{"owner":"","view":None},"monitor":{"owner":"","view":None}},
  "phoneUntil":0
}
(local/"state.json").write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
(local/"data.json").write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding="utf-8")

redirect_tpl = '''<!doctype html><meta charset="utf-8"><title>{title}</title>
<script>
const cloud="{cloud}";
const route="{route}";
if(location.protocol==="file:") location.replace(cloud+route);
else location.replace(route);
</script>
<p>{title} очилмоқда…</p>'''
for fname,title,route in [
    ("admin.html","ADMIN","/admin?mode=computer"),
    ("monitor.html","MONITOR","/monitor?mode=monitor"),
    ("phone.html","PHONE","/phone?mode=phone"),
    ("Dashboard_GoogleSheets.html","Dashboard Google Sheets","/admin?mode=computer"),
    ("DashBoard_index.html","Dashboard","/admin?mode=computer"),
]:
    write(local/fname, redirect_tpl.format(title=title,cloud=CLOUD,route=route))

start_all = r'''@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8765
where py >nul 2>nul
if %errorlevel%==0 (
  start "MAMURIYAT_SERVER" cmd /k "title MAMURIYAT_SERVER & py -3 server.py"
) else (
  start "MAMURIYAT_SERVER" cmd /k "title MAMURIYAT_SERVER & python server.py"
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/admin?mode=computer"
start "" "http://127.0.0.1:8765/monitor?mode=monitor"
call SHOW_IP.bat
'''
write(local/"START_ALL.bat", start_all)
write(local/"START_CLOUD.bat", r'''@echo off
start "" "https://v18-dashboard-server.nill-kaffri-2009.workers.dev/admin?mode=computer"
start "" "https://v18-dashboard-server.nill-kaffri-2009.workers.dev/monitor?mode=monitor"
''')
write(local/"STOP_ALL.bat", r'''@echo off
taskkill /FI "WINDOWTITLE eq MAMURIYAT_SERVER*" /T /F >nul 2>nul
echo Mamuriyat local server yopildi.
timeout /t 2 >nul
''')
write(local/"SHOW_IP.bat", r'''@echo off
chcp 65001 >nul
echo.
echo ===== IPv4 manzillar =====
ipconfig | findstr /R /C:"IPv4"
echo.
echo Telefon: http://PC_IP:8765/phone?mode=phone
echo Monitor: http://PC_IP:8765/monitor?mode=monitor
echo.
pause
''')
write(local/"CHECK_NETWORK.bat", r'''@echo off
chcp 65001 >nul
echo ===== NETWORK CHECK =====
ipconfig | findstr /R /C:"IPv4"
echo.
ping -n 2 v18-dashboard-server.nill-kaffri-2009.workers.dev
echo.
pause
''')
write(local/"PHONE_MONITOR.txt", f'''MAMURIYAT DASHBOARD LINKS

CLOUD ADMIN:
{CLOUD}/admin?mode=computer

CLOUD PHONE:
{CLOUD}/phone?mode=phone

CLOUD MONITOR (READ ONLY):
{CLOUD}/monitor?mode=monitor

LOCAL/LAN:
PC Admin: http://127.0.0.1:8765/admin?mode=computer
Phone:    http://PC_IP:8765/phone?mode=phone
Monitor:  http://PC_IP:8765/monitor?mode=monitor

PC_IP ni SHOW_IP.bat orqali toping.
''')

# 4) Google Apps Script proxy material retained for recovery/alternative deployment
code_gs = r'''const SPREADSHEET_ID = "1IWyUdorge58MbvpNlB5Z08Rawm8AdoeHinxgjiFktF4";
const TOKEN = "CHANGE_THIS_PRIVATE_TOKEN";

function doGet(e) {
  if (TOKEN !== "CHANGE_THIS_PRIVATE_TOKEN" && (!e || !e.parameter || e.parameter.token !== TOKEN)) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:"forbidden"}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const names = [
    "21010 Tibbiy qism (16)",
    "21111 Farroshlar (65)",
    "21113 Bog‘bonlar (36)",
    "21120 Umumiy ovqatlanish (200)",
    "21130 Oziq-ovqat ta‘minoti (8)",
    "21140 Yotoqxona majmuasi (17)"
  ];
  const out = {};
  names.forEach(n => {
    const sh=ss.getSheetByName(n);
    out[n]=sh ? sh.getDataRange().getDisplayValues() : null;
  });
  return ContentService.createTextOutput(JSON.stringify({ok:true,spreadsheetId:SPREADSHEET_ID,sheets:out}))
    .setMimeType(ContentService.MimeType.JSON);
}
'''
write(PKG/"GOOGLE_APPS_SCRIPT"/"Code.gs", code_gs)

# 5) Legacy source archives retained, not used by current live build.
legacy = PKG/"LEGACY_ARCHIVES"
legacy.mkdir()
for name in [
    "V18_ASOSIY_DESIGN_2_CONTROL_SYNC_FIXED.zip",
    "V18_GOOGLE_SHEETS_FINAL_FIXED.zip",
    "V18_KUNLIK_DAVOMAD_PC_MONITOR_PHONE_FIXED.zip",
]:
    p=ROOT/name
    if p.exists(): shutil.copy2(p, legacy/name)

# 6) Documentation / inventory
counts = snapshot.get("counts") or snapshot.get("countsByMonth") or {}
coverage = snapshot.get("counts") or {}
readme = f'''V20_ASOSIY_3_FINAL_14_COMPLETE_PACKAGE
================================================

ASOSIY: Asosiy dizayn 3
MAIN: Kunlik davomad
ALOHIDA: Ish soatlari, KPI
Google Sheets: LIVE, 2 sekund polling
PC ↔ PHONE: boshqaruv almashadi
MONITOR: faqat ko‘rish
Scroll mirror: scrollRatio
Cache: no-store + version auto-reload
Live build: V20.5 / final14 complete-sync fixes

DOIMIY CLOUD LINKLAR:
ADMIN   {CLOUD}/admin?mode=computer
PHONE   {CLOUD}/phone?mode=phone
MONITOR {CLOUD}/monitor?mode=monitor

PAPKA TARKIBI:
CLOUDFLARE/      - hozirgi live Worker manbasi
LOCAL_LAN/       - server.py, START_ALL, STOP_ALL, admin/monitor/phone fayllari
DATA/            - packaging vaqtida olingan to‘liq Google Sheets snapshot
TESTS/           - avtomatik testlar
.github/workflows/ - deploy va APK workflowlar
GOOGLE_APPS_SCRIPT/ - Code.gs material
LEGACY_ARCHIVES/ - oldingi V18 to‘liq arxivlar
OFFICE_SOURCE/   - ChatGPT tomondan qo‘shiladigan Office manba fayllari

MUHIM:
- Sentabr Google Sheets manbasida bo‘lmasa sayt uni sun’iy 0 deb qabul qilmaydi.
- Oxirgi to‘liq mavjud oy avtomatik tavsiya qilinadi.
- Monitor control olmaydi.
- Eski saqlangan Workers URL o‘zgarmaydi.
'''
write(PKG/"README_UZ.txt",readme)
write(PKG/"LIVE_LINKS.txt",f'''ADMIN={CLOUD}/admin?mode=computer
PHONE={CLOUD}/phone?mode=phone
MONITOR={CLOUD}/monitor?mode=monitor
HEALTH={CLOUD}/api/health
GOOGLE_TEST={CLOUD}/api/google-test
''')
info={
  "package":NAME,
  "liveBase":CLOUD,
  "records":len(snapshot.get("records",[])),
  "refreshedAt":snapshot.get("refreshedAt"),
  "source":snapshot.get("source"),
  "files_note":"Generated from current main after live verification"
}
(PKG/"VERSION_INFO.json").write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding="utf-8")

# 7) Archive
zip_path = OUT/(NAME+".zip")
with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED,allowZip64=True) as z:
    for p in PKG.rglob("*"):
        if p.is_file():
            z.write(p, p.relative_to(OUT))
print(zip_path)
print("records",len(snapshot.get("records",[])))
