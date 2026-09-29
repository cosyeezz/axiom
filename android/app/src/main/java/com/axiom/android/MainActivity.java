package com.axiom.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import bridge.Bridge;

/** Native shell: no JS interface, VpnService, embedded auth keys or public gateway. */
public final class MainActivity extends Activity {
    private static final int CANVAS=0xff010102, SURFACE=0xff0f1011, INK=0xfff7f8f8,
            MUTED=0xff8a8f98, BORDER=0xff23252a, PRIMARY=0xff5e6ad2;
    private static final ExecutorService NETWORK=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private LinearLayout root, connection;
    private TextView status;
    private EditText address;
    private Button connect, login, recovery, panelLogin, panelReload, panelSwitch, panelClear;
    private AlertDialog connectionPanel;
    private TextView panelStatus;
    private JSONObject lastStatus=new JSONObject();
    private static final String NATIVE_PATH="/_axiom/native/connection";
    private WebView web;
    private String localOrigin="", localToken="", authUrl="", currentTarget="";
    private boolean busy=false, loading=false, statusInFlight=false;
    private boolean documentReady=false, pageLoading=false, retryBlocked=false;
    private static final int MAX_PROBE_FAILURES=8;
    private int retryFailures=0;
    private long nextProbeAt=0, lastRecoveryWake=-30000;
    private volatile boolean resumeNode=false;
    private ConnectivityManager connectivity;
    private final ConnectivityManager.NetworkCallback networkCallback=new ConnectivityManager.NetworkCallback(){
        @Override public void onAvailable(Network network){handler.post(()->{if(foreground&&!destroyed)wakeRecovery();});}
    };
    private String retryMessage="";
    private volatile boolean foreground=false, destroyed=false;
    private volatile int generation=0;
    private ValueCallback<Uri[]> fileCallback;
    private SharedPreferences preferences;
    private final Runnable poll=new Runnable(){public void run(){
        if(!foreground||destroyed)return;
        if(!busy) refreshStatus();
        else schedulePoll();
    }};

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        preferences=getSharedPreferences("connection",MODE_PRIVATE);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(CANVAS);
        root.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
        });
        setContentView(root);
        connectivity=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        try{connectivity.registerDefaultNetworkCallback(networkCallback);}catch(RuntimeException ignored){}
        showConnection();
        String saved=preferences.getString("target","");
        address.setText(saved);
        if(!saved.isEmpty())startConnection();
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(8));d.setStroke(dp(1),BORDER);return d;}
    private TextView text(String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setPadding(0,dp(8),0,dp(8));return t;}
    private Button button(String label,boolean primary,Runnable action){
        Button b=new Button(this);b.setText(label);b.setTextSize(14);b.setAllCaps(false);b.setTextColor(INK);b.setMinHeight(dp(48));b.setPadding(dp(14),dp(8),dp(14),dp(8));b.setBackground(shape(primary?PRIMARY:SURFACE));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(12);b.setLayoutParams(p);b.setOnClickListener(v->action.run());return b;
    }
    private void showConnection(){
        root.removeAllViews();
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        connection=new LinearLayout(this);connection.setOrientation(LinearLayout.VERTICAL);connection.setPadding(dp(24),dp(32),dp(24),dp(24));
        TextView title=text("Axiom",28,INK);title.setTypeface(Typeface.DEFAULT,Typeface.BOLD);connection.addView(title);
        connection.addView(text("连接电脑上的工作台 · 应用内 Tailscale",14,MUTED));
        connection.addView(text("电脑地址",14,INK));
        address=new EditText(this);address.setSingleLine(true);address.setTextSize(16);address.setTextColor(INK);address.setHintTextColor(MUTED);address.setHint("100.x.x.x:4319");address.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);address.setBackground(shape(SURFACE));address.setPadding(dp(12),dp(8),dp(12),dp(8));address.setMinHeight(dp(48));connection.addView(address);
        address.setText(preferences.getString("target",""));
        connection.addView(text("也可使用完整设备名 xxx.ts.net。电脑需开启 Axiom 远程访问，并与本应用使用同一个人账号。",12,MUTED));
        status=text("首次使用需要登录 Tailscale，之后打开应用自动恢复。",14,INK);connection.addView(status);
        connect=button("连接工作台",true,this::startConnection);connection.addView(connect);
        login=button("登录 Tailscale",false,this::openLogin);login.setVisibility(View.GONE);connection.addView(login);
        connection.addView(button("更多",false,()->new AlertDialog.Builder(this).setTitle("Axiom Android "+BuildConfig.VERSION_NAME).setItems(new String[]{"关于连接与隐私","清除本机登录状态"},(d,w)->{if(w==1)confirmReset();else new AlertDialog.Builder(this).setTitle("关于连接").setMessage("应用内 Tailscale，不占用系统 VPN。手机不运行 Agent；关闭应用不会停止电脑上的任务。节点身份保存在本应用私有目录。预览版本。").setPositiveButton("知道了",null).show();}).show()));
        scroll.addView(connection);root.addView(scroll,new LinearLayout.LayoutParams(-1,-1));
    }
    private void setBusy(boolean value){
        busy=value;if(connect!=null)connect.setEnabled(!value);if(address!=null)address.setEnabled(!value);if(login!=null)login.setEnabled(!value);
        for(Button b:new Button[]{panelLogin,panelReload,panelSwitch,panelClear})if(b!=null)b.setEnabled(!value);
    }
    private void confirmReset(){
        if(busy)return;
        new AlertDialog.Builder(this).setTitle("清除本机登录？").setMessage("会关闭当前页面并删除本应用保存的节点身份，未发送的草稿会丢失。需要时请到 Tailscale 管理后台撤销该设备；不会修改电脑设置。")
            .setNegativeButton("取消",null).setPositiveButton("清除",(d,w)->{if(!busy)resetIdentity();}).show();
    }
    private void showConnectionPanel(){
        if(web==null||destroyed||connectionPanel!=null)return;
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(24),dp(8),dp(24),dp(16));
        content.addView(text("当前电脑："+preferences.getString("target","未配置"),14,INK));
        panelStatus=text(lastStatus.optString("message","查看连接或恢复页面"),14,MUTED);content.addView(panelStatus);
        panelLogin=button("登录 Tailscale",true,this::openLogin);content.addView(panelLogin);
        panelLogin.setVisibility(lastStatus.optBoolean("needsLogin")?View.VISIBLE:View.GONE);
        panelReload=button("刷新页面…",false,()->new AlertDialog.Builder(this).setTitle("刷新页面？").setMessage("将重新加载工作台，未发送的草稿和阅读位置可能丢失。普通断线会自动重连，无需刷新。")
            .setNegativeButton("取消",null).setPositiveButton("刷新",(d,w)->{if(busy)return;closeConnectionPanel();reloadWorkspace();}).show());content.addView(panelReload);
        panelSwitch=button("切换电脑…",false,()->new AlertDialog.Builder(this).setTitle("切换电脑？").setMessage("会关闭当前页面并返回地址输入页，未发送的草稿会丢失。")
            .setNegativeButton("取消",null).setPositiveButton("继续",(d,w)->{if(!busy)leaveWorkspace();}).show());content.addView(panelSwitch);
        panelClear=button("清除本机登录…",false,this::confirmReset);content.addView(panelClear);
        content.addView(text("Android "+BuildConfig.VERSION_NAME+" · 查看设置不会断开连接",12,MUTED));
        ScrollView scroll=new ScrollView(this);scroll.addView(content);
        connectionPanel=new AlertDialog.Builder(this).setTitle("连接设置").setView(scroll).setNegativeButton("返回工作台",null).create();
        connectionPanel.setOnDismissListener(d->{connectionPanel=null;panelStatus=null;panelLogin=null;panelReload=null;panelSwitch=null;panelClear=null;});
        connectionPanel.show();setBusy(busy);
    }
    private void reloadWorkspace(){
        if(web==null)return;
        if(documentReady){web.reload();return;} // Explicit confirmed refresh; never resume automatic reloads.
        resetRecovery();
        buildWebView(localOrigin,localToken);
    }
    private void closeConnectionPanel(){if(connectionPanel!=null)connectionPanel.dismiss();}
    private void showStatusMessage(String message){if(status!=null)status.setText(message);if(panelStatus!=null)panelStatus.setText(message);}
    private void startConnection(){
        if(busy)return;
        final String target=address.getText().toString().trim();
        final int ticket=++generation;currentTarget="";authUrl="";
        resetRecovery();
        login.setVisibility(View.GONE);
        if(target.isEmpty()){status.setText("请输入电脑的 Tailscale 地址。");return;}
        setBusy(true);status.setText("正在启动应用内网络…");
        NETWORK.execute(()->{
            try{
                Bridge.start(getNoBackupFilesDir().getAbsolutePath()+"/tailscale",target);
                JSONObject result=new JSONObject(Bridge.status());
                handler.post(()->{if(stale(ticket))return;setBusy(false);currentTarget=target;preferences.edit().putString("target",target).apply();renderStatus(result);});
            }catch(Exception e){handler.post(()->{if(stale(ticket))return;setBusy(false);currentTarget="";status.setText("连接失败："+safeMessage(e));});}
        });
    }
    private boolean stale(int ticket){return destroyed||ticket!=generation;}
    private String safeMessage(Exception e){String s=e.getMessage();return s==null?"请稍后重试":s;}
    private void schedulePoll(){
        handler.removeCallbacks(poll);
        if(foreground&&!destroyed)handler.postDelayed(poll,2500);
    }
    private void refreshStatus(){
        // Only one queued/running query. Slow LocalAPI must not starve user actions.
        if(statusInFlight)return;
        statusInFlight=true;
        final int ticket=generation;
        NETWORK.execute(()->{
            JSONObject result=null;
            try{
                if(foreground&&!stale(ticket)){
                    Bridge.renew();result=new JSONObject(Bridge.status());
                    if(resumeNode){
                        resumeNode=false;
                        if("Stopped".equals(result.optString("state"))){Bridge.resume();result=new JSONObject(Bridge.status());}
                    }
                }
            }catch(Exception ignored){}
            final JSONObject snapshot=result;
            handler.post(()->{
                statusInFlight=false;
                if(foreground&&!stale(ticket)&&!busy&&snapshot!=null)renderStatus(snapshot);
                schedulePoll();
            });
        });
    }
    private void renderStatus(JSONObject s){
        lastStatus=s;
        authUrl=s.optString("authUrl","");
        if(login!=null)login.setVisibility(s.optBoolean("needsLogin")?View.VISIBLE:View.GONE);
        if(panelLogin!=null)panelLogin.setVisibility(s.optBoolean("needsLogin")?View.VISIBLE:View.GONE);
        updateRecoveryBanner();
        showStatusMessage(retryMessage.isEmpty()?s.optString("message","等待连接"):retryMessage);
        if(s.optBoolean("running")&&shouldProbe())openWorkspace();
    }
    private void openLogin(){
        if(busy)return;
        final int ticket=generation;setBusy(true);showStatusMessage("正在准备登录…");
        NETWORK.execute(()->{try{Bridge.login();JSONObject s=new JSONObject(Bridge.status());handler.post(()->{if(stale(ticket))return;setBusy(false);renderStatus(s);if(!authUrl.isEmpty())launchAuth(authUrl);else showStatusMessage("正在生成授权链接，请稍后点击登录。");});}catch(Exception e){handler.post(()->{if(stale(ticket))return;setBusy(false);showStatusMessage(safeMessage(e));});}});
    }
    private void launchAuth(String value){
        Uri u=Uri.parse(value);String host=u.getHost();
        if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||host==null||!(host.equals("login.tailscale.com")||host.equals("controlplane.tailscale.com"))){showStatusMessage("拒绝非官方登录地址。");return;}
        external(u);
    }
    private void external(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception e){Toast.makeText(this,"没有可用的浏览器",Toast.LENGTH_LONG).show();}}
    private void resetRecovery(){retryFailures=0;nextProbeAt=0;retryBlocked=false;retryMessage="";documentReady=false;pageLoading=false;}
    private void wakeRecovery(){
        long now=SystemClock.elapsedRealtime();
        if(now-lastRecoveryWake<30000)return;
        lastRecoveryWake=now;resumeNode=true;
        if(!retryBlocked&&!documentReady){retryFailures=0;nextProbeAt=0;}
        // Fixed local event, no arbitrary JS/native capability or document reload.
        if(documentReady&&web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('online'))",null);
    }
    private boolean shouldProbe(){return foreground&&!destroyed&&!documentReady&&!pageLoading&&!loading&&!busy&&!retryBlocked&&retryFailures<MAX_PROBE_FAILURES&&!currentTarget.isEmpty()&&SystemClock.elapsedRealtime()>=nextProbeAt;}
    private void updateRecoveryBanner(){
        if(recovery==null)return;
        boolean loginNeeded=lastStatus.optBoolean("needsLogin");
        recovery.setText(loginNeeded?"Tailscale 需要登录 · 打开连接设置":retryMessage+" · 连接设置");
        recovery.setVisibility(loginNeeded||!retryMessage.isEmpty()?View.VISIBLE:View.GONE);
    }
    private void failedProbe(String message,boolean retryable){
        loading=false;pageLoading=false;setBusy(false);retryBlocked=!retryable;
        retryFailures=Math.min(retryFailures+1,MAX_PROBE_FAILURES);
        nextProbeAt=SystemClock.elapsedRealtime()+Math.min(30000,2000L<<Math.min(retryFailures-1,4));
        retryMessage=message+(!retryable?"\n请检查权限或地址后手动连接。":retryFailures>=MAX_PROBE_FAILURES?"\n自动重试已暂停，等待网络或回到前台；也可手动连接。":"\n正在自动重试；请确认电脑在线。");
        showStatusMessage(retryMessage);updateRecoveryBanner();
    }
    private void openWorkspace(){
        loading=true;setBusy(true);final int ticket=generation;showStatusMessage("正在检查电脑连接…");
        NETWORK.execute(()->{try{
            JSONObject probe=new JSONObject(Bridge.probeState());final String origin=Bridge.localURL();final String token=Bridge.sessionToken();
            handler.post(()->{
                if(stale(ticket))return;
                if(!probe.optBoolean("ok")){failedProbe(probe.optString("message"),probe.optBoolean("retryable"));return;}
                loading=false;setBusy(false);
                if(!foreground){nextProbeAt=0;return;}
                if(web==null)buildWebView(origin,token);
                else if(!documentReady&&origin.equals(localOrigin))buildWebView(origin,token);
            });
        }catch(Exception e){handler.post(()->{if(!stale(ticket))failedProbe(safeMessage(e),true);});}});
    }
    private boolean initialDocument(WebView view,int ticket,WebResourceRequest request){
        return view==web&&!stale(ticket)&&!documentReady&&pageLoading&&request.isForMainFrame()
            &&"GET".equals(request.getMethod())&&request.getUrl().toString().equals(localOrigin+"/");
    }
    private void completeDocument(WebView view,int ticket,String url){
        if(view!=web||stale(ticket)||!pageLoading||!url.equals(localOrigin+"/"))return;
        pageLoading=false;documentReady=true;retryFailures=0;retryMessage="";updateRecoveryBanner();
    }
    private boolean sameOrigin(Uri uri){
        Uri base=Uri.parse(localOrigin);return "http".equals(uri.getScheme())&&"127.0.0.1".equals(uri.getHost())&&uri.getPort()==base.getPort()&&uri.getUserInfo()==null;
    }
    private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private boolean nativeRequest(Uri uri){return uri.getPath()!=null&&uri.getPath().startsWith("/_axiom/native");}
    private boolean allowConnectionIntent(WebView view,WebResourceRequest request){
        return view==web&&view.getUrl()!=null&&sameOrigin(Uri.parse(view.getUrl()))
            &&request.isForMainFrame()&&request.hasGesture()&&!request.isRedirect()&&"GET".equals(request.getMethod())
            &&request.getUrl().toString().equals(localOrigin+NATIVE_PATH);
    }
    private void buildWebView(String origin,String token){
        // A failed initial document gets a new instance: late callbacks cannot complete the next attempt.
        if(web!=null){WebView old=web;web=null;old.stopLoading();if(old.getParent() instanceof ViewGroup)((ViewGroup)old.getParent()).removeView(old);old.destroy();}
        localOrigin=origin;localToken=token;documentReady=false;pageLoading=true;root.removeAllViews();
        recovery=button("Tailscale 需要登录 · 打开连接设置",false,this::showConnectionPanel);
        recovery.setVisibility(lastStatus.optBoolean("needsLogin")?View.VISIBLE:View.GONE);
        root.addView(recovery);
        web=new WebView(this);final WebView instance=web;final int ticket=generation;
        web.setBackgroundColor(CANVAS);WebSettings settings=web.getSettings();
        // Presentation capability only; no secrets and never an authentication signal.
        settings.setUserAgentString(settings.getUserAgentString()+" AxiomAndroid/"+BuildConfig.VERSION_NAME+" NativeConnection/1");
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        CookieManager cookies=CookieManager.getInstance();cookies.setAcceptCookie(true);cookies.setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(nativeRequest(request.getUrl())){
                    if(allowConnectionIntent(view,request))showConnectionPanel();
                    return true; // Consume invalid/unknown reserved actions too.
                }
                if(sameOrigin(request.getUrl()))return false;
                // Never navigate to other loopback ports: cookies are not port-scoped.
                if(request.isForMainFrame()&&request.hasGesture()&&"https".equals(request.getUrl().getScheme())&&request.getUrl().getHost()!=null&&!request.getUrl().getHost().equals("127.0.0.1"))external(request.getUrl());
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return sameOrigin(request.getUrl())&&!nativeRequest(request.getUrl())?null:blocked();}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(initialDocument(view,ticket,request))failedProbe("页面连接中断",error.getErrorCode()!=WebViewClient.ERROR_FAILED_SSL_HANDSHAKE);
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){
                if(initialDocument(view,ticket,request)){
                    int code=response.getStatusCode();failedProbe("页面返回 HTTP "+code,code==408||code==429||code>=500);
                }
            }
            @Override public void onPageCommitVisible(WebView view,String url){completeDocument(view,ticket,url);}
            @Override public void onReceivedSslError(WebView view,SslErrorHandler h,android.net.http.SslError error){h.cancel();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("image/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
                try{startActivityForResult(intent,10);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}return true;
            }
        });
        root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        LocalCookies.set(origin,token,()->!stale(ticket)&&web==instance&&origin.equals(localOrigin),ok->{
            if(stale(ticket)||web!=instance||!origin.equals(localOrigin))return;
            if(Boolean.TRUE.equals(ok))instance.loadUrl(origin+"/");else{leaveWorkspace();status.setText("无法建立本地安全会话，请重试。");}
        });
    }
    private void destroyWeb(){
        closeConnectionPanel();recovery=null;resetRecovery();
        if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}
        if(web!=null){web.stopLoading();web.loadUrl("about:blank");if(web.getParent() instanceof ViewGroup)((ViewGroup)web.getParent()).removeView(web);web.destroy();web=null;}
        LocalCookies.clear();localOrigin="";localToken="";
    }
    private void leaveWorkspace(){
        ++generation;loading=false;currentTarget="";destroyWeb();NETWORK.execute(()->Bridge.disconnect());showConnection();
    }
    private void resetIdentity(){
        ++generation;loading=false;currentTarget="";destroyWeb();showConnection();setBusy(true);
        NETWORK.execute(()->{try{Bridge.reset(getNoBackupFilesDir().getAbsolutePath()+"/tailscale");handler.post(()->{if(destroyed)return;setBusy(false);authUrl="";login.setVisibility(View.GONE);status.setText("已清除本机登录。点击连接后重新授权。");});}catch(Exception e){handler.post(()->{if(destroyed)return;setBusy(false);status.setText(safeMessage(e));});}});
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==10&&fileCallback!=null){Uri[] files=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){int n=Math.min(data.getClipData().getItemCount(),4);files=new Uri[n];for(int i=0;i<n;i++)files[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)files=new Uri[]{data.getData()};}fileCallback.onReceiveValue(files);fileCallback=null;}}
    @Override protected void onResume(){super.onResume();foreground=true;if(web!=null)web.onResume();wakeRecovery();handler.removeCallbacks(poll);handler.post(poll);}
    @Override protected void onPause(){foreground=false;handler.removeCallbacks(poll);if(web!=null)web.onPause();super.onPause();}
    @Override public void onBackPressed(){if(web!=null){if(web.canGoBack())web.goBack();else showConnectionPanel();}else super.onBackPressed();}
    @Override protected void onDestroy(){try{if(connectivity!=null)connectivity.unregisterNetworkCallback(networkCallback);}catch(RuntimeException ignored){}destroyed=true;foreground=false;++generation;handler.removeCallbacksAndMessages(null);destroyWeb();NETWORK.execute(()->Bridge.disconnect());super.onDestroy();}
}
