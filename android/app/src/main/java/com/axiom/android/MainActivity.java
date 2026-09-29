package com.axiom.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
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
    private Button connect, login;
    private WebView web;
    private String localOrigin="", authUrl="", currentTarget="";
    private boolean busy=false, loading=false, statusInFlight=false;
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
        connection.addView(text("你的工作台，随身连接。",16,INK));
        connection.addView(text("应用内 Tailscale · 不占用系统 VPN",12,MUTED));
        connection.addView(text("电脑地址",14,INK));
        address=new EditText(this);address.setSingleLine(true);address.setTextSize(16);address.setTextColor(INK);address.setHintTextColor(MUTED);address.setHint("100.x.x.x:4319");address.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);address.setBackground(shape(SURFACE));address.setPadding(dp(12),dp(8),dp(12),dp(8));address.setMinHeight(dp(48));connection.addView(address);
        address.setText(preferences.getString("target",""));
        connection.addView(text("也可使用完整设备名 xxx.ts.net。电脑需开启 Axiom 远程访问，并与本应用使用同一个人账号。",12,MUTED));
        status=text("首次使用需要登录 Tailscale，之后打开应用自动恢复。",14,INK);connection.addView(status);
        connect=button("连接工作台",true,this::startConnection);connection.addView(connect);
        login=button("登录 Tailscale",false,this::openLogin);login.setVisibility(View.GONE);connection.addView(login);
        connection.addView(button("清除本机登录状态",false,()->new AlertDialog.Builder(this).setTitle("清除本机登录？").setMessage("会关闭连接并删除本应用保存的节点身份。需要时请到 Tailscale 管理后台撤销该设备；不会修改电脑设置。").setNegativeButton("取消",null).setPositiveButton("清除",(d,w)->resetIdentity()).show()));
        connection.addView(text("Android "+BuildConfig.VERSION_NAME+" · 首版预览\n不在手机运行 Agent；关闭应用不会停止电脑上的任务。",12,MUTED));
        scroll.addView(connection);root.addView(scroll,new LinearLayout.LayoutParams(-1,-1));
    }
    private void setBusy(boolean value){busy=value;if(connect!=null)connect.setEnabled(!value);if(address!=null)address.setEnabled(!value);}
    private void startConnection(){
        if(busy)return;
        final String target=address.getText().toString().trim();
        final int ticket=++generation;currentTarget="";authUrl="";
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
                if(foreground&&!stale(ticket)){Bridge.renew();result=new JSONObject(Bridge.status());}
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
        authUrl=s.optString("authUrl","");
        if(login!=null)login.setVisibility(s.optBoolean("needsLogin")?View.VISIBLE:View.GONE);
        if(status!=null)status.setText(s.optString("message","等待连接"));
        if(s.optBoolean("running")&&web==null&&!loading&&!busy&&!currentTarget.isEmpty())openWorkspace();
    }
    private void openLogin(){
        final int ticket=generation;setBusy(true);status.setText("正在准备登录…");
        NETWORK.execute(()->{try{Bridge.login();JSONObject s=new JSONObject(Bridge.status());handler.post(()->{if(stale(ticket))return;setBusy(false);renderStatus(s);if(!authUrl.isEmpty())launchAuth(authUrl);else status.setText("正在生成授权链接，请稍后点击登录。");});}catch(Exception e){handler.post(()->{if(stale(ticket))return;setBusy(false);status.setText(safeMessage(e));});}});
    }
    private void launchAuth(String value){
        Uri u=Uri.parse(value);String host=u.getHost();
        if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||host==null||!(host.equals("login.tailscale.com")||host.equals("controlplane.tailscale.com"))){status.setText("拒绝非官方登录地址。");return;}
        external(u);
    }
    private void external(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception e){Toast.makeText(this,"没有可用的浏览器",Toast.LENGTH_LONG).show();}}
    private void openWorkspace(){
        loading=true;setBusy(true);final int ticket=generation;status.setText("正在检查电脑连接…");
        NETWORK.execute(()->{try{
            Bridge.probe();final String origin=Bridge.localURL();final String token=Bridge.sessionToken();
            handler.post(()->{if(stale(ticket))return;loading=false;setBusy(false);buildWebView(origin,token);});
        }catch(Exception e){handler.post(()->{if(stale(ticket))return;loading=false;setBusy(false);currentTarget="";status.setText(safeMessage(e)+"\n检查后点击连接重试。");});}});
    }
    private boolean sameOrigin(Uri uri){
        Uri base=Uri.parse(localOrigin);return "http".equals(uri.getScheme())&&"127.0.0.1".equals(uri.getHost())&&uri.getPort()==base.getPort()&&uri.getUserInfo()==null;
    }
    private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private void buildWebView(String origin,String token){
        localOrigin=origin;root.removeAllViews();
        LinearLayout toolbar=new LinearLayout(this);toolbar.setPadding(dp(12),0,dp(12),0);toolbar.setOrientation(LinearLayout.HORIZONTAL);
        Button back=button("连接设置",false,this::leaveWorkspace);toolbar.addView(back,new LinearLayout.LayoutParams(0,dp(48),1));
        Button reload=button("重新连接",false,()->NETWORK.execute(()->{Bridge.renew();handler.post(()->{if(web!=null)web.reload();});}));toolbar.addView(reload,new LinearLayout.LayoutParams(0,dp(48),1));root.addView(toolbar);
        web=new WebView(this);web.setBackgroundColor(CANVAS);WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        CookieManager cookies=CookieManager.getInstance();cookies.setAcceptCookie(true);cookies.setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(sameOrigin(request.getUrl()))return false;
                // Never navigate to other loopback ports: cookies are not port-scoped.
                if(request.isForMainFrame()&&request.hasGesture()&&"https".equals(request.getUrl().getScheme())&&request.getUrl().getHost()!=null&&!request.getUrl().getHost().equals("127.0.0.1"))external(request.getUrl());
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return sameOrigin(request.getUrl())?null:blocked();}
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
        cookies.setCookie(origin+"/","axiom_local_session="+token+"; Path=/; HttpOnly; SameSite=Strict",ok->{
            if(destroyed||web==null||!origin.equals(localOrigin))return;
            if(Boolean.TRUE.equals(ok))web.loadUrl(origin+"/");else{leaveWorkspace();status.setText("无法建立本地安全会话，请重试。");}
        });
    }
    private void destroyWeb(){
        if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}
        if(web!=null){web.stopLoading();web.loadUrl("about:blank");((ViewGroup)web.getParent()).removeView(web);web.destroy();web=null;}
        CookieManager.getInstance().removeAllCookies(null);localOrigin="";
    }
    private void leaveWorkspace(){
        ++generation;loading=false;currentTarget="";destroyWeb();NETWORK.execute(()->Bridge.disconnect());showConnection();
    }
    private void resetIdentity(){
        ++generation;loading=false;currentTarget="";destroyWeb();setBusy(true);
        NETWORK.execute(()->{try{Bridge.reset(getNoBackupFilesDir().getAbsolutePath()+"/tailscale");handler.post(()->{if(destroyed)return;setBusy(false);authUrl="";login.setVisibility(View.GONE);status.setText("已清除本机登录。点击连接后重新授权。");});}catch(Exception e){handler.post(()->{if(destroyed)return;setBusy(false);status.setText(safeMessage(e));});}});
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==10&&fileCallback!=null){Uri[] files=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){int n=Math.min(data.getClipData().getItemCount(),4);files=new Uri[n];for(int i=0;i<n;i++)files[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)files=new Uri[]{data.getData()};}fileCallback.onReceiveValue(files);fileCallback=null;}}
    @Override protected void onResume(){super.onResume();foreground=true;if(web!=null)web.onResume();handler.removeCallbacks(poll);handler.post(poll);}
    @Override protected void onPause(){foreground=false;handler.removeCallbacks(poll);if(web!=null)web.onPause();super.onPause();}
    @Override public void onBackPressed(){if(web!=null){if(web.canGoBack())web.goBack();else leaveWorkspace();}else super.onBackPressed();}
    @Override protected void onDestroy(){destroyed=true;foreground=false;++generation;handler.removeCallbacksAndMessages(null);destroyWeb();NETWORK.execute(()->Bridge.disconnect());super.onDestroy();}
}
