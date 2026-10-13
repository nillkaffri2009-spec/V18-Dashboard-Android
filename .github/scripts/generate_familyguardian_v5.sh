#!/usr/bin/env bash
set -euo pipefail
rm -rf fgbuild
mkdir -p fgbuild/parent/src/main/java/uz/familyguardian/parent
mkdir -p fgbuild/child/src/main/java/uz/familyguardian/child

cat > fgbuild/settings.gradle.kts <<'EOF'
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "FamilyGuardian"
include(":parent", ":child")
EOF

cat > fgbuild/build.gradle.kts <<'EOF'
plugins {
    id("com.android.application") version "8.7.3" apply false
}
EOF

cat > fgbuild/parent/build.gradle.kts <<'EOF'
plugins { id("com.android.application") }

android {
    namespace = "uz.familyguardian.parent"
    compileSdk = 35

    defaultConfig {
        applicationId = "uz.familyguardian.parent"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "5.0"
    }
}

EOF

cat > fgbuild/child/build.gradle.kts <<'EOF'
plugins { id("com.android.application") }

android {
    namespace = "uz.familyguardian.child"
    compileSdk = 35

    defaultConfig {
        applicationId = "uz.familyguardian.child"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "5.0"
    }
}
EOF

cat > fgbuild/parent/src/main/AndroidManifest.xml <<'EOF'
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <application
        android:allowBackup="true"
        android:label="Family Guardian Parent"
        android:usesCleartextTraffic="false"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>
EOF

cat > fgbuild/child/src/main/AndroidManifest.xml <<'EOF'
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"/>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC"/>

    <application
        android:allowBackup="true"
        android:label="Family Guardian Child"
        android:usesCleartextTraffic="false"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity
            android:name=".CameraApprovalActivity"
            android:exported="false"/>
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        <service
            android:name=".GuardianService"
            android:exported="false"
            android:foregroundServiceType="dataSync"/>
    </application>
</manifest>
EOF

cat > fgbuild/parent/src/main/java/uz/familyguardian/parent/MainActivity.java <<'EOF'
package uz.familyguardian.parent;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private EditText server, family, secret;
    private TextView output;
    private SharedPreferences prefs;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("fg_parent", MODE_PRIVATE);

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int p = dp(18);
        root.setPadding(p,p,p,p);
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Family Guardian — Ота-она");
        title.setTextSize(24);
        title.setTypeface(null, 1);
        root.addView(title, full());

        TextView note = new TextView(this);
        note.setText("Очиқ ва розиликка асосланган ота-она назорати. Камера сўрови фарзанд телефонида тасдиқланади.");
        note.setPadding(0,dp(8),0,dp(8));
        root.addView(note, full());

        server = edit("https://server.example.com", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        family = edit("6 хонали оила коди", InputType.TYPE_CLASS_NUMBER);
        secret = edit("Боғлаш калити", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        family.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(6) });
        root.addView(server, full()); root.addView(family, full()); root.addView(secret, full());

        Button save = button("Уланишни сақлаш");
        Button status = button("Фарзанд телефони ҳолати");
        Button location = button("Жойлашувни сўраш");
        Button usage = button("Илова фаоллиги ҳисоботини сўраш");
        Button camera = button("Камера сессиясини сўраш");
        Button refresh = button("Натижани янгилаш");
        root.addView(save, full()); root.addView(status, full()); root.addView(location, full());
        root.addView(usage, full()); root.addView(camera, full()); root.addView(refresh, full());

        output = new TextView(this);
        output.setText("Натижа шу ерда чиқади.");
        output.setTextIsSelectable(true);
        output.setPadding(0,dp(14),0,dp(30));
        root.addView(output, full());

        server.setText(prefs.getString("server",""));
        family.setText(prefs.getString("family",""));
        secret.setText(prefs.getString("secret",""));

        save.setOnClickListener(v -> { saveCfg(); show("Уланиш маълумотлари сақланди."); });
        status.setOnClickListener(v -> request("status"));
        location.setOnClickListener(v -> request("location"));
        usage.setOnClickListener(v -> request("usage"));
        camera.setOnClickListener(v -> request("camera"));
        refresh.setOnClickListener(v -> fetchResult());

        setContentView(scroll);
    }

    private LinearLayout.LayoutParams full() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }
    private int dp(int n){ return (int)(n*getResources().getDisplayMetrics().density+0.5f); }
    private EditText edit(String hint, int type){ EditText e=new EditText(this); e.setHint(hint); e.setInputType(type); return e; }
    private Button button(String t){ Button b=new Button(this); b.setText(t); return b; }

    private void saveCfg() {
        prefs.edit()
            .putString("server", server.getText().toString().trim().replaceAll("/+$",""))
            .putString("family", family.getText().toString().trim())
            .putString("secret", secret.getText().toString())
            .apply();
    }

    private String[] cfg() {
        saveCfg();
        return new String[]{server.getText().toString().trim().replaceAll("/+$",""), family.getText().toString().trim(), secret.getText().toString()};
    }

    private void request(String type) {
        String[] c=cfg();
        if(c[0].isEmpty() || c[1].length()!=6 || c[2].isEmpty()) { show("Сервер, 6 хонали оила коди ва калитни киритинг."); return; }
        show("Сўров юборилмоқда…");
        new Thread(() -> {
            try {
                JSONObject body=new JSONObject().put("family",c[1]).put("secret",c[2]).put("type",type);
                ui(http(c[0]+"/request","POST",body.toString()));
            } catch(Exception e){ ui("Хато: "+e.getMessage()); }
        }).start();
    }

    private void fetchResult() {
        String[] c=cfg();
        if(c[0].isEmpty() || c[1].length()!=6 || c[2].isEmpty()) { show("Уланиш маълумотларини тўлдиринг."); return; }
        new Thread(() -> {
            try {
                String q="family="+URLEncoder.encode(c[1],"UTF-8")+"&secret="+URLEncoder.encode(c[2],"UTF-8");
                ui(http(c[0]+"/result?"+q,"GET",null));
            } catch(Exception e){ ui("Хато: "+e.getMessage()); }
        }).start();
    }

    private String http(String u, String method, String body) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(12000); c.setReadTimeout(12000);
        c.setRequestProperty("Content-Type","application/json; charset=utf-8");
        if(body!=null) {
            c.setDoOutput(true);
            try(OutputStream os=c.getOutputStream()){ os.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code=c.getResponseCode();
        InputStream in=(code>=200 && code<300)?c.getInputStream():c.getErrorStream();
        if(in==null) return "HTTP "+code;
        try(BufferedReader br=new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))){
            StringBuilder sb=new StringBuilder(); String line;
            while((line=br.readLine())!=null) sb.append(line);
            return sb.toString();
        }
    }
    private void ui(String s){ runOnUiThread(() -> output.setText(s)); }
    private void show(String s){ output.setText(s); }
}
EOF

cat > fgbuild/child/src/main/java/uz/familyguardian/child/MainActivity.java <<'EOF'
package uz.familyguardian.child;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.widget.*;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final int REQ=77;
    private SharedPreferences prefs;
    private EditText server, family, secret;
    private CheckBox shareLocation, shareUsage;
    private TextView status;
    private boolean pendingStart=false;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        prefs=getSharedPreferences("fg_child",MODE_PRIVATE);
        ScrollView scroll=new ScrollView(this);
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        int p=dp(18); root.setPadding(p,p,p,p); scroll.addView(root);

        TextView title=new TextView(this); title.setText("Family Guardian — Фарзанд"); title.setTextSize(24); title.setTypeface(null,1); root.addView(title,full());
        TextView note=new TextView(this); note.setText("Назорат фақат кўринадиган рухсатлар билан ишлайди. Фон хизмати ишласа доимий билдиришнома кўринади."); note.setPadding(0,dp(8),0,dp(8)); root.addView(note,full());

        server=edit("https://server.example.com",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);
        family=edit("6 хонали оила коди",InputType.TYPE_CLASS_NUMBER);
        family.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(6)});
        secret=edit("Боғлаш калити",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(server,full()); root.addView(family,full()); root.addView(secret,full());

        shareLocation=new CheckBox(this); shareLocation.setText("Жойлашувни ота-она билан улашишга рухсат"); root.addView(shareLocation,full());
        shareUsage=new CheckBox(this); shareUsage.setText("Илова фаоллиги ҳисоботини улашишга рухсат"); root.addView(shareUsage,full());

        Button usageSettings=button("Илова фаоллиги рухсатини очиш");
        Button start=button("Назорат алоқасини ёқиш");
        Button stop=button("Назорат алоқасини тўхтатиш");
        root.addView(usageSettings,full()); root.addView(start,full()); root.addView(stop,full());
        status=new TextView(this); status.setText("Ҳолат: ўчирилган"); status.setPadding(0,dp(12),0,dp(30)); root.addView(status,full());

        server.setText(prefs.getString("server","")); family.setText(prefs.getString("family","")); secret.setText(prefs.getString("secret",""));
        shareLocation.setChecked(prefs.getBoolean("loc",false)); shareUsage.setChecked(prefs.getBoolean("usage",false));

        usageSettings.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)));
        start.setOnClickListener(v -> prepareStart());
        stop.setOnClickListener(v -> { stopService(new Intent(this,GuardianService.class)); status.setText("Ҳолат: тўхтатилди."); });
        setContentView(scroll);
    }

    private void prepareStart(){
        String s=server.getText().toString().trim().replaceAll("/+$","");
        String f=family.getText().toString().trim();
        String k=secret.getText().toString();
        if(s.isEmpty()||f.length()!=6||k.isEmpty()){ status.setText("Сервер, 6 хонали код ва калитни тўлдиринг."); return; }
        prefs.edit().putString("server",s).putString("family",f).putString("secret",k)
            .putBoolean("loc",shareLocation.isChecked()).putBoolean("usage",shareUsage.isChecked()).apply();

        ArrayList<String> req=new ArrayList<>();
        if(shareLocation.isChecked()){
            if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
                req.add(Manifest.permission.ACCESS_FINE_LOCATION); req.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
        }
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
            req.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if(!req.isEmpty()){
            pendingStart=true;
            requestPermissions(req.toArray(new String[0]),REQ);
        } else startGuardian();
    }

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){
        super.onRequestPermissionsResult(requestCode,permissions,grantResults);
        if(requestCode==REQ && pendingStart){
            pendingStart=false;
            if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
                status.setText("Доимий билдиришнома учун рухсат керак. Рухсат бериб қайта ёқинг.");
                return;
            }
            if(shareLocation.isChecked() && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
                prefs.edit().putBoolean("loc",false).apply();
                shareLocation.setChecked(false);
                Toast.makeText(this,"Жойлашув рухсати берилмади — улашиш ўчирилди.",Toast.LENGTH_LONG).show();
            }
            startGuardian();
        }
    }

    private void startGuardian(){
        Intent i=new Intent(this,GuardianService.class);
        if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
        status.setText("Ҳолат: фаол. Доимий билдиришнома кўринади.");
    }

    private LinearLayout.LayoutParams full(){ return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT); }
    private int dp(int n){ return (int)(n*getResources().getDisplayMetrics().density+0.5f); }
    private EditText edit(String hint,int type){ EditText e=new EditText(this); e.setHint(hint); e.setInputType(type); return e; }
    private Button button(String t){ Button b=new Button(this); b.setText(t); return b; }
}
EOF

cat > fgbuild/child/src/main/java/uz/familyguardian/child/GuardianService.java <<'EOF'
package uz.familyguardian.child;

import android.Manifest;
import android.app.*;
import android.app.usage.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class GuardianService extends Service {
    private static final String CH="guardian";
    private static final int FG_ID=41;
    private Handler handler;
    private SharedPreferences prefs;
    private final Runnable poll=new Runnable(){
        @Override public void run(){ checkPending(); handler.postDelayed(this,10000); }
    };

    @Override public void onCreate(){
        super.onCreate();
        prefs=getSharedPreferences("fg_child",MODE_PRIVATE);
        handler=new Handler(Looper.getMainLooper());
        NotificationManager nm=getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH,"Family Guardian",NotificationManager.IMPORTANCE_LOW));
        Notification n=new Notification.Builder(this,CH)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Family Guardian фаол")
            .setContentText("Ота-она назорати алоқаси очиқ")
            .setOngoing(true).build();
        startForeground(FG_ID,n);
        handler.post(poll);
    }
    @Override public int onStartCommand(Intent i,int flags,int startId){ return START_STICKY; }
    @Override public void onDestroy(){ if(handler!=null) handler.removeCallbacks(poll); super.onDestroy(); }
    @Override public android.os.IBinder onBind(Intent i){ return null; }

    private void checkPending(){
        final String s=prefs.getString("server","");
        final String f=prefs.getString("family","");
        final String k=prefs.getString("secret","");
        if(s==null||s.isEmpty()||f==null||f.length()!=6||k==null||k.isEmpty()) return;
        new Thread(() -> {
            try{
                String q="family="+URLEncoder.encode(f,"UTF-8")+"&secret="+URLEncoder.encode(k,"UTF-8");
                JSONObject j=new JSONObject(http(s+"/pending?"+q,"GET",null));
                String type=j.optString("type","");
                if(type.isEmpty()) return;
                if(type.equals("status")) send(s,f,k,"status",new JSONObject().put("online",true).put("visibleMonitoring",true));
                else if(type.equals("location") && prefs.getBoolean("loc",false)) sendLocation(s,f,k);
                else if(type.equals("usage") && prefs.getBoolean("usage",false)) sendUsage(s,f,k);
                else if(type.equals("camera")) showCameraApproval();
            }catch(Exception ignored){}
        }).start();
    }

    private void sendLocation(String s,String f,String k){
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED) return;
        LocationManager lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        Location best=null;
        for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
            try{
                Location x=lm.getLastKnownLocation(provider);
                if(x!=null && (best==null || x.getTime()>best.getTime())) best=x;
            }catch(Exception ignored){}
        }
        if(best==null) return;
        try{
            JSONObject d=new JSONObject().put("lat",best.getLatitude()).put("lon",best.getLongitude())
                .put("accuracy",best.getAccuracy()).put("time",best.getTime());
            send(s,f,k,"location",d);
        }catch(Exception ignored){}
    }

    private void sendUsage(String s,String f,String k){
        try{
            UsageStatsManager us=(UsageStatsManager)getSystemService(USAGE_STATS_SERVICE);
            long end=System.currentTimeMillis();
            List<UsageStats> all=us.queryUsageStats(UsageStatsManager.INTERVAL_DAILY,end-86400000L,end);
            all.sort((a,b)->Long.compare(b.getTotalTimeInForeground(),a.getTotalTimeInForeground()));
            StringBuilder sb=new StringBuilder(); int count=0;
            for(UsageStats x:all){
                if(x.getTotalTimeInForeground()<=0) continue;
                if(count++>=10) break;
                if(sb.length()>0) sb.append(" | ");
                sb.append(x.getPackageName()).append(": ").append(x.getTotalTimeInForeground()/60000L).append(" min");
            }
            send(s,f,k,"usage",new JSONObject().put("apps",sb.toString()));
        }catch(Exception ignored){}
    }

    private void showCameraApproval(){
        Intent i=new Intent(this,CameraApprovalActivity.class);
        PendingIntent pi=PendingIntent.getActivity(this,52,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification n=new Notification.Builder(this,CH)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Камера сессияси сўрови")
            .setContentText("Тасдиқлаш ёки рад этиш учун босинг.")
            .setContentIntent(pi).setAutoCancel(true).build();
        getSystemService(NotificationManager.class).notify(52,n);
    }

    private void send(String s,String f,String k,String type,JSONObject data){
        try{
            JSONObject body=new JSONObject().put("family",f).put("secret",k).put("type",type).put("data",data);
            http(s+"/result","POST",body.toString());
        }catch(Exception ignored){}
    }

    private String http(String u,String method,String body)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(12000); c.setReadTimeout(12000);
        c.setRequestProperty("Content-Type","application/json; charset=utf-8");
        if(body!=null){ c.setDoOutput(true); try(OutputStream os=c.getOutputStream()){ os.write(body.getBytes(StandardCharsets.UTF_8)); } }
        int code=c.getResponseCode();
        InputStream in=(code>=200&&code<300)?c.getInputStream():c.getErrorStream();
        if(in==null) return "{}";
        try(BufferedReader br=new BufferedReader(new InputStreamReader(in,StandardCharsets.UTF_8))){
            StringBuilder sb=new StringBuilder(); String line; while((line=br.readLine())!=null) sb.append(line); return sb.toString();
        }
    }
}
EOF

cat > fgbuild/child/src/main/java/uz/familyguardian/child/CameraApprovalActivity.java <<'EOF'
package uz.familyguardian.child;

import android.app.*;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class CameraApprovalActivity extends Activity {
    private TextView text;
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        text=new TextView(this);
        int p=(int)(24*getResources().getDisplayMetrics().density);
        text.setPadding(p,p,p,p);
        text.setText("Ота-она камера сессиясини сўради. Яширин камера йўқ: фақат шу ердаги очиқ тасдиқдан кейин рухсат қайтарилади.");
        setContentView(text);
        new AlertDialog.Builder(this)
            .setTitle("Камера сўрови")
            .setMessage("Камера сессияси сўровини тасдиқлайсизми?")
            .setPositiveButton("Розиман",(d,w)->{ sendDecision(true); text.setText("Розилик берилди. Бу версия видеони яширин узатмайди; серверга фақат тасдиқ жавоби юборилади."); })
            .setNegativeButton("Рад этиш",(d,w)->{ sendDecision(false); finish(); })
            .setCancelable(false).show();
    }

    private void sendDecision(boolean ok){
        SharedPreferences p=getSharedPreferences("fg_child",MODE_PRIVATE);
        String s=p.getString("server",""); String f=p.getString("family",""); String k=p.getString("secret","");
        if(s==null||s.isEmpty()) return;
        new Thread(() -> {
            try{
                JSONObject body=new JSONObject().put("family",f).put("secret",k).put("type","camera")
                    .put("data",new JSONObject().put("approved",ok).put("visibleConsent",true));
                HttpURLConnection c=(HttpURLConnection)new URL(s.replaceAll("/+$","")+"/result").openConnection();
                c.setRequestMethod("POST"); c.setConnectTimeout(12000); c.setReadTimeout(12000);
                c.setRequestProperty("Content-Type","application/json; charset=utf-8"); c.setDoOutput(true);
                try(OutputStream os=c.getOutputStream()){ os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
                c.getResponseCode(); c.disconnect();
            }catch(Exception ignored){}
        }).start();
    }
}
EOF

echo "Generated FamilyGuardian v5 Android project."
