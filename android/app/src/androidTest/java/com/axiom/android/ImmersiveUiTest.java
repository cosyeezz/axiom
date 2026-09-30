package com.axiom.android;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityWindowInfo;
import android.webkit.WebView;
import android.widget.ScrollView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** Real emulator input/IME and window lifecycle, synthetic loopback HTML only. Not a tailnet/OEM claim. */
public final class ImmersiveUiTest {
    private final Instrumentation inst=InstrumentationRegistry.getInstrumentation();
    private ConnectionRecoveryTest.Server server;
    private int accessibilityFlags;
    private ActivityScenario<MainActivity> activeScenario;
    private static final String HTML="<meta name='viewport' content='width=device-width,initial-scale=1,user-scalable=no'>"
        +"<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#5e6ad2}*{box-sizing:border-box}"
        +"#composer{position:fixed;left:16px;right:16px;bottom:16px;display:flex;gap:8px;height:64px}"
        +"textarea{flex:1;min-width:0;font-size:18px}button{width:88px;font-size:18px}</style>"
        +"<div id='composer'><textarea id='draft'></textarea><button id='action' onclick='window.taps++'>Check</button></div>"
        +"<script>window.sentinel='document-'+Math.random();window.taps=0;</script>";
    @Before public void before() throws Exception {
        server=new ConnectionRecoveryTest.Server(HTML);
        AccessibilityServiceInfo info=inst.getUiAutomation().getServiceInfo();
        accessibilityFlags=info.flags;info.flags|=AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        inst.getUiAutomation().setServiceInfo(info);
    }
    @After public void after() throws Exception {
        AccessibilityServiceInfo info=inst.getUiAutomation().getServiceInfo();info.flags=accessibilityFlags;
        inst.getUiAutomation().setServiceInfo(info);
        if(server!=null)server.close();
    }
    private ActivityScenario<MainActivity> launch(boolean workspace) throws Exception {
        inst.getTargetContext().getSharedPreferences("connection",Context.MODE_PRIVATE).edit().clear().commit();
        ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class);
        activeScenario=s;
        s.onActivity(a->{stopPoll(a);if(workspace)call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"synthetic-token");});
        waitFor(()->read(s,a->a.hasWindowFocus()&&(!workspace||(Boolean)get(a,"documentReady"))),"window/document ready");
        if(workspace)waitFor(()->"true".equals(js(s,"!!document.getElementById('draft')")),"fixture DOM ready");
        waitFor(()->imeBounds()==null,"initial IME hidden");
        waitGeometryStable(s,false);
        if(workspace){
            CountDownLatch drawn=new CountDownLatch(1);
            s.onActivity(a->((WebView)get(a,"web")).postVisualStateCallback(1,new WebView.VisualStateCallback(){
                @Override public void onComplete(long id){drawn.countDown();}
            }));
            assertTrue("fixture drawn",drawn.await(10,TimeUnit.SECONDS));
        }
        return s;
    }
    @Test public void realImeControlsAndBackPreserveDocument() throws Exception {
        try(ActivityScenario<MainActivity> s=launch(true)){
            waitBarsHidden(s);
            WebView original=read(s,a->(WebView)get(a,"web"));
            String sentinel=js(s,"sentinel");
            int before=read(s,a->((WebView)get(a,"web")).getHeight());
            logGeometry("before IME");
            js(s,"draft.value='keep-draft-'");
            tap(element(s,"draft"));
            waitFor(()->imeBounds()!=null,"real IME window appeared");
            waitFor(()->"\"draft\"".equals(js(s,"document.activeElement.id")),"textarea focused");
            waitGeometryStable(s,true);
            // Injected key events while an actual software IME is visible; this
            // covers viewport/input focus, not OEM composition/commitText quality.
            inst.sendStringSync("abc");
            waitFor(()->js(s,"draft.value").contains("abc"),"key input with IME visible");
            waitFor(()->read(s,a->((WebView)get(a,"web")).getHeight())<before,"IME resized content");
            s.onActivity(a->{
                if(Build.VERSION.SDK_INT>=30)assertTrue(a.getWindow().getDecorView().getRootWindowInsets().isVisible(WindowInsets.Type.ime()));
                assertSame(original,get(a,"web"));
            });
            assertAboveIme(s,"draft");assertAboveIme(s,"action");
            tap(element(s,"action"));waitFor(()->"1".equals(js(s,"taps")),"visible action receives actual touch");
            tap(element(s,"draft"));waitFor(()->imeBounds()!=null,"IME before Back");
            waitGeometryStable(s,true);
            String draft=js(s,"draft.value");
            logGeometry("before IME Back");
            inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            waitFor(()->imeBounds()==null,"Back closes IME");
            logGeometry("IME window gone");
            waitFor(()->read(s,MainActivity::hasWindowFocus),"Activity focus after IME Back");
            s.onActivity(a->assertNull("IME Back must not open settings",get(a,"connectionPanel")));
            waitGeometryStable(s,false);
            waitFor(()->read(s,a->((WebView)get(a,"web")).getHeight()==before),"viewport restored exactly to "+before);
            s.onActivity(a->{assertNull("IME Back must not open settings",get(a,"connectionPanel"));assertSame(original,get(a,"web"));});
            assertEquals(sentinel,js(s,"sentinel"));assertEquals(draft,js(s,"draft.value"));
            waitBarsHidden(s);assertSafeArea(s);
        }
    }
    @Test public void realPauseStopResumeRetainsWebViewAndDraft() throws Exception {
        try(ActivityScenario<MainActivity> s=launch(true)){
            js(s,"draft.value='resume-draft'");String before=js(s,"draft.value+'|'+sentinel");
            MainActivity original=read(s,a->a);WebView web=read(s,a->(WebView)get(a,"web"));
            int generation=read(s,a->(Integer)get(a,"generation"));
            s.moveToState(Lifecycle.State.STARTED);assertEquals(Lifecycle.State.STARTED,s.getState());
            s.moveToState(Lifecycle.State.CREATED);assertEquals(Lifecycle.State.CREATED,s.getState());
            s.moveToState(Lifecycle.State.RESUMED);
            waitFor(()->read(s,MainActivity::hasWindowFocus),"resumed focus");
            s.onActivity(a->{
                assertSame(original,a);assertSame(web,get(a,"web"));assertEquals(generation,get(a,"generation"));
                assertEquals(true,get(a,"documentReady"));assertNull(get(a,"connectionPanel"));stopPoll(a);
            });
            assertEquals(before,js(s,"draft.value+'|'+sentinel"));waitBarsHidden(s);assertSafeArea(s);
        }
    }
    @Test public void nativeConnectionActionIsReachableWithRealIme() throws Exception {
        try(ActivityScenario<MainActivity> s=launch(false)){
            tap(read(s,a->bounds((View)get(a,"address"))));waitFor(()->imeBounds()!=null,"native IME");
            waitGeometryStable(s,true);
            // Scrolling is fixture setup. Instant scrollTo avoids fullScroll's smooth
            // animation swallowing the first DOWN to stop scrolling or moving focus.
            // The assertion still requires one actual touch on the native button.
            s.onActivity(a->{
                ScrollView scroll=(ScrollView)((View)get(a,"connection")).getParent();
                scroll.scrollTo(0,scroll.getChildAt(0).getHeight());
            });
            waitGeometryStable(s,true);
            waitFor(()->read(s,a->{
                View button=(View)get(a,"connect");Rect b=bounds(button),visible=new Rect(),ime=imeBounds();
                return ime!=null&&!Rect.intersects(b,ime)&&button.getGlobalVisibleRect(visible)&&visible.equals(b)&&button.isEnabled();
            }),"native connect fully visible above IME");
            logGeometry("before native connect tap");
            tap(read(s,a->bounds((View)get(a,"connect"))));
            waitFor(()->read(s,a->((android.widget.TextView)get(a,"status")).getText().toString().equals("请输入电脑的 Tailscale 地址。")),"actual native button click");
            inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);waitFor(()->imeBounds()==null,"native Back closes IME");
            waitBarsHidden(s);
        }
    }
    @Test public void edgeSwipeTransientBarsReturnWithoutRelayoutOrReload() throws Exception {
        try(ActivityScenario<MainActivity> s=launch(true)){
            waitBarsHidden(s);assertSafeArea(s);
            Rect before=read(s,a->bounds((View)get(a,"web")));String content=js(s,"draft.value+'|'+sentinel");
            // Static solid fixture + top strip avoids caret and bottom composer noise.
            int band=read(s,a->Math.round(28*a.getResources().getDisplayMetrics().density));
            Bitmap baseline=stableScreenshot(s,band);
            saveScreenshot(baseline,"transient-baseline");
            try{
                swipe(baseline.getWidth()/4f,1,baseline.getWidth()/4f,band*2.5f);
                waitFor(()->stripDifference(baseline,band)>0.008,"top edge actually reveals transient system UI");
                Bitmap revealed=inst.getUiAutomation().takeScreenshot();assertNotNull(revealed);
                try{saveScreenshot(revealed,"transient-revealed");}finally{revealed.recycle();}
                assertEquals("visible transient bar must not move content",before,read(s,a->bounds((View)get(a,"web"))));
                // No controller.hide(), taps or lifecycle calls here: require automatic disappearance.
                waitFor(()->stripDifference(baseline,band)<0.004,"transient bar automatically disappears",20000);
                assertEquals(before,read(s,a->bounds((View)get(a,"web"))));
                assertEquals(content,js(s,"draft.value+'|'+sentinel"));waitBarsHidden(s);
            }finally{baseline.recycle();}
        }
    }
    @Test public void nativeDialogCancelRestoresImmersiveWorkspace() throws Exception {
        try(ActivityScenario<MainActivity> s=launch(true)){
            js(s,"draft.value='dialog-draft'");String before=js(s,"draft.value+'|'+sentinel");
            WebView web=read(s,a->(WebView)get(a,"web"));waitBarsHidden(s);
            inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            waitFor(()->read(s,a->get(a,"connectionPanel")!=null),"Back opens native settings");
            Rect close=read(s,a->bounds(((android.app.AlertDialog)get(a,"connectionPanel")).getButton(android.app.AlertDialog.BUTTON_NEGATIVE)));
            assertTrue("dialog close reachable",close.top>=0&&close.width()>0&&close.height()>0);
            tap(close);
            waitFor(()->read(s,a->get(a,"connectionPanel")==null&&a.hasWindowFocus()),"dialog closed");
            s.onActivity(a->assertSame(web,get(a,"web")));
            assertEquals(before,js(s,"draft.value+'|'+sentinel"));waitBarsHidden(s);assertSafeArea(s);
        }
    }
    private void assertSafeArea(ActivityScenario<MainActivity> s){
        s.onActivity(a->{
            View root=(View)get(a,"root"),web=(View)get(a,"web");
            WindowInsetsCompat insets=ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());assertNotNull(insets);
            androidx.core.graphics.Insets cutout=insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            if("true".equals(InstrumentationRegistry.getArguments().getString("requireCutout")))assertTrue("configured cutout exists",cutout.top+cutout.bottom+cutout.left+cutout.right>0);
            assertTrue(root.getPaddingTop()>=cutout.top);assertTrue(root.getPaddingLeft()>=cutout.left);
            assertTrue(root.getPaddingRight()>=cutout.right);assertTrue(root.getPaddingBottom()>=cutout.bottom);
            assertEquals(root.getPaddingTop(),web.getTop());
            assertEquals(root.getWidth()-root.getPaddingLeft()-root.getPaddingRight(),web.getWidth());
        });
    }
    private void waitBarsHidden(ActivityScenario<MainActivity> s)throws Exception{
        waitFor(()->read(s,a->{
            if(!a.hasWindowFocus())return false;
            View decor=a.getWindow().getDecorView();
            if(Build.VERSION.SDK_INT>=30){WindowInsets i=decor.getRootWindowInsets();return i!=null&&!i.isVisible(WindowInsets.Type.statusBars())&&!i.isVisible(WindowInsets.Type.navigationBars());}
            int f=decor.getSystemUiVisibility();return (f&View.SYSTEM_UI_FLAG_FULLSCREEN)!=0&&(f&View.SYSTEM_UI_FLAG_HIDE_NAVIGATION)!=0&&(f&View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)!=0;
        }),"system bars hidden (legacy flags on API26-29)");
    }
    private Rect imeBounds(){
        Rect result=null;
        for(AccessibilityWindowInfo w:inst.getUiAutomation().getWindows())try{
            if(w.getType()==AccessibilityWindowInfo.TYPE_INPUT_METHOD){Rect b=new Rect();w.getBoundsInScreen(b);if(!b.isEmpty())result=b;}
        }finally{w.recycle();}
        return result;
    }
    private void assertAboveIme(ActivityScenario<MainActivity> s,String id)throws Exception{
        Rect control=element(s,id),web=read(s,a->bounds((View)get(a,"web"))),ime=imeBounds();
        assertNotNull(ime);assertTrue(id+" "+control+" outside WebView "+web,web.contains(control));
        assertFalse(id+" "+control+" intersects IME "+ime,Rect.intersects(control,ime));
    }
    private Rect element(ActivityScenario<MainActivity> s,String id){
        try{
            JSONArray r=new JSONArray(js(s,"(()=>{const r=document.getElementById('"+id+"').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth]})()"));
            Rect web=read(s,a->bounds((View)get(a,"web")));double scale=web.width()/r.getDouble(4);
            return new Rect(web.left+(int)Math.round(r.getDouble(0)*scale),web.top+(int)Math.round(r.getDouble(1)*scale),web.left+(int)Math.round(r.getDouble(2)*scale),web.top+(int)Math.round(r.getDouble(3)*scale));
        }catch(Exception e){throw new AssertionError(e);}
    }
    private static Rect bounds(View v){int[] xy=new int[2];v.getLocationOnScreen(xy);return new Rect(xy[0],xy[1],xy[0]+v.getWidth(),xy[1]+v.getHeight());}
    private void tap(Rect r){long t=SystemClock.uptimeMillis();inject(t,t,MotionEvent.ACTION_DOWN,r.exactCenterX(),r.exactCenterY());inject(t,t+60,MotionEvent.ACTION_UP,r.exactCenterX(),r.exactCenterY());}
    private void swipe(float x,float y,float endX,float endY){
        long t=SystemClock.uptimeMillis();inject(t,t,MotionEvent.ACTION_DOWN,x,y);
        for(int i=1;i<=12;i++){SystemClock.sleep(16);inject(t,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,x+(endX-x)*i/12,y+(endY-y)*i/12);}
        inject(t,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,endX,endY);
    }
    private void inject(long down,long time,int action,float x,float y){MotionEvent e=MotionEvent.obtain(down,time,action,x,y,0);e.setSource(InputDevice.SOURCE_TOUCHSCREEN);try{assertTrue(inst.getUiAutomation().injectInputEvent(e,true));}finally{e.recycle();}}
    private Bitmap stableScreenshot(ActivityScenario<MainActivity> s,int band)throws Exception{
        // DOM ready is not a draw barrier; require fixture color in the workspace
        // and multiple stable frames before measuring a real edge gesture.
        Rect web=read(s,a->bounds((View)get(a,"web")));
        Bitmap previous=null;int stable=0;
        long end=SystemClock.uptimeMillis()+10000;
        while(SystemClock.uptimeMillis()<end){
            Bitmap shot=inst.getUiAutomation().takeScreenshot();assertNotNull("screenshot available",shot);
            boolean color=(shot.getPixel(web.centerX(),web.centerY())&0xffffff)==0x5e6ad2;
            stable=color&&previous!=null&&stripDifference(previous,shot,band)<0.004?stable+1:0;
            if(previous!=null)previous.recycle();previous=shot;
            if(stable>=4)return shot;
            Thread.sleep(150);
        }
        if(previous!=null){saveScreenshot(previous,"unstable-baseline");previous.recycle();}
        throw new AssertionError("fixture pixels did not settle before baseline");
    }
    private void saveScreenshot(Bitmap bitmap,String name)throws Exception{
        java.io.File directory=new java.io.File(inst.getTargetContext().getExternalFilesDir(null),"immersive");
        assertTrue(directory.isDirectory()||directory.mkdirs());
        try(java.io.OutputStream out=new java.io.FileOutputStream(new java.io.File(directory,name+".png"))){
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,out));
        }
        // AGP may uninstall the debug package; move evidence outside app storage.
        shell("mkdir -p /sdcard/Download/axiom-immersive");
        shell("cp "+new java.io.File(directory,name+".png").getAbsolutePath()+" /sdcard/Download/axiom-immersive/");
    }
    private void shell(String command)throws Exception{
        try(java.io.InputStream stream=new android.os.ParcelFileDescriptor.AutoCloseInputStream(inst.getUiAutomation().executeShellCommand(command))){
            byte[] buffer=new byte[4096];while(stream.read(buffer)!=-1){}
        }
    }
    private double stripDifference(Bitmap baseline,int band){
        Bitmap shot=inst.getUiAutomation().takeScreenshot();assertNotNull("screenshot available",shot);
        try{return stripDifference(baseline,shot,band);}finally{shot.recycle();}
    }
    private double stripDifference(Bitmap baseline,Bitmap shot,int band){
            assertEquals("screenshot width",baseline.getWidth(),shot.getWidth());
            assertEquals("screenshot height",baseline.getHeight(),shot.getHeight());
            int changed=0,total=0;
            for(int y=2;y<Math.min(band,shot.getHeight());y+=2)for(int x=4;x<shot.getWidth()-4;x+=2){
                int a=baseline.getPixel(x,y),b=shot.getPixel(x,y);total++;
                if(Math.abs(android.graphics.Color.red(a)-android.graphics.Color.red(b))+Math.abs(android.graphics.Color.green(a)-android.graphics.Color.green(b))+Math.abs(android.graphics.Color.blue(a)-android.graphics.Color.blue(b))>60)changed++;
            }
            return changed/(double)Math.max(total,1);
    }
    private void waitGeometryStable(ActivityScenario<MainActivity> s,boolean ime)throws Exception{
        String[] previous={""};int[] stable={0};
        waitFor(()->{
            String value=read(s,a->{
                View root=(View)get(a,"root"),web=(View)get(a,"web"),connect=(View)get(a,"connect");
                WindowInsetsCompat i=ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());
                if(!a.hasWindowFocus()||i==null||i.isVisible(WindowInsetsCompat.Type.ime())!=ime||(imeBounds()!=null)!=ime)return "";
                return bounds(root)+"|"+root.getPaddingTop()+","+root.getPaddingBottom()+"|"+i.getInsets(WindowInsetsCompat.Type.ime())
                    +"|"+(web==null?bounds(connect):bounds(web));
            });
            stable[0]=!value.isEmpty()&&value.equals(previous[0])?stable[0]+1:0;previous[0]=value;
            return stable[0]>=5;
        },"stable geometry IME="+ime);
    }
    private String js(ActivityScenario<MainActivity> s,String code){
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        s.onActivity(a->((WebView)get(a,"web")).evaluateJavascript(code,v->{result.set(v);done.countDown();}));
        try{assertTrue(done.await(5,TimeUnit.SECONDS));}catch(InterruptedException e){throw new AssertionError(e);}return result.get();
    }
    private interface Reader<T>{T apply(MainActivity a);}
    private <T>T read(ActivityScenario<MainActivity>s,Reader<T> fn){AtomicReference<T> r=new AtomicReference<>();s.onActivity(a->r.set(fn.apply(a)));return r.get();}
    private void waitFor(BooleanSupplier check,String message)throws Exception{waitFor(check,message,10000);}
    private void waitFor(BooleanSupplier check,String message,int timeout)throws Exception{
        long end=SystemClock.uptimeMillis()+timeout;
        while(SystemClock.uptimeMillis()<end){if(check.getAsBoolean())return;Thread.sleep(100);}
        logGeometry(message);
        // Capture before try-with-resources closes the Activity. The shell trap's
        // final screenshot otherwise contains only the launcher, losing the failure.
        String path="/sdcard/Download/axiom-immersive/"+message.replaceAll("[^A-Za-z0-9]+","-");
        try{
            shell("mkdir -p /sdcard/Download/axiom-immersive");
            shell("screencap -p "+path+".png");
            captureText("dumpsys window",path+"-window.txt");
            captureText("dumpsys input_method",path+"-ime.txt");
        }catch(Exception e){android.util.Log.w("ImmersiveEvidence","capture failed",e);}
        fail(message);
    }
    private void captureText(String command,String destination)throws Exception{
        java.io.File file=new java.io.File(inst.getTargetContext().getExternalFilesDir(null),"window-evidence.txt");
        try(java.io.InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(inst.getUiAutomation().executeShellCommand(command));
                java.io.OutputStream out=new java.io.FileOutputStream(file)){
            byte[] buffer=new byte[4096];int count;while((count=in.read(buffer))!=-1)out.write(buffer,0,count);
        }
        shell("cp "+file.getAbsolutePath()+" "+destination);
    }
    private void logGeometry(String label){
        if(activeScenario==null)return;
        activeScenario.onActivity(a->{
            View root=(View)get(a,"root"),web=(View)get(a,"web"),connect=(View)get(a,"connect");
            WindowInsetsCompat insets=ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());
            Rect visible=new Rect();boolean shown=connect!=null&&connect.getGlobalVisibleRect(visible);
            android.util.Log.i("ImmersiveEvidence",label+" focus="+a.hasWindowFocus()+" root="+bounds(root)
                +" padding="+root.getPaddingLeft()+","+root.getPaddingTop()+","+root.getPaddingRight()+","+root.getPaddingBottom()
                +" web="+(web==null?"none":bounds(web))+" IME="+imeBounds()
                +" imeInsets="+(insets==null?"none":insets.getInsets(WindowInsetsCompat.Type.ime()))
                +" barsInsets="+(insets==null?"none":insets.getInsets(WindowInsetsCompat.Type.systemBars()))
                +" barsVisible="+(insets!=null&&insets.isVisible(WindowInsetsCompat.Type.systemBars()))
                +" connect="+(connect==null?"none":bounds(connect))+" visible="+shown+":"+visible
                +" status="+((android.widget.TextView)get(a,"status")).getText());
        });
    }
    private static void stopPoll(MainActivity a){set(a,"foreground",false);((Handler)get(a,"handler")).removeCallbacks((Runnable)get(a,"poll"));}
    private static Object get(MainActivity a,String n){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);return f.get(a);}catch(Exception e){throw new AssertionError(e);}}
    private static void set(MainActivity a,String n,Object v){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);f.set(a,v);}catch(Exception e){throw new AssertionError(e);}}
    private static Object call(MainActivity a,String n,Class<?>[] types,Object...args){try{Method m=MainActivity.class.getDeclaredMethod(n,types);m.setAccessible(true);return m.invoke(a,args);}catch(Exception e){throw new AssertionError(e);}}
}
