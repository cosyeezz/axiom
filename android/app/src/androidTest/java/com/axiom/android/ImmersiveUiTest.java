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
        s.onActivity(a->{stopPoll(a);if(workspace)call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"synthetic-token");});
        waitFor(()->read(s,a->a.hasWindowFocus()&&(!workspace||(Boolean)get(a,"documentReady"))),"window/document ready");
        if(workspace)waitFor(()->"true".equals(js(s,"!!document.getElementById('draft')")),"fixture DOM ready");
        waitFor(()->imeBounds()==null,"initial IME hidden");
        return s;
    }
    @Test public void realImeControlsAndBackPreserveDocument() throws Exception {
        try(ActivityScenario<MainActivity> s=launch(true)){
            waitBarsHidden(s);
            WebView original=read(s,a->(WebView)get(a,"web"));
            String sentinel=js(s,"sentinel");
            int before=read(s,a->((WebView)get(a,"web")).getHeight());
            js(s,"draft.value='keep-draft-'");
            tap(element(s,"draft"));
            waitFor(()->imeBounds()!=null,"real IME window appeared");
            waitFor(()->"\"draft\"".equals(js(s,"document.activeElement.id")),"textarea focused");
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
            String draft=js(s,"draft.value");
            inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            waitFor(()->imeBounds()==null,"Back closes IME");
            waitFor(()->read(s,a->a.hasWindowFocus()&&((WebView)get(a,"web")).getHeight()==before),"viewport restored");
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
            // Empty address validates locally; never initiates a tailnet request.
            s.onActivity(a->((ScrollView)((View)get(a,"connection")).getParent()).fullScroll(View.FOCUS_DOWN));
            waitFor(()->{
                Rect b=read(s,a->bounds((View)get(a,"connect"))),ime=imeBounds();
                return ime!=null&&!Rect.intersects(b,ime)&&b.top>=0;
            },"native connect above IME");
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
            Bitmap baseline=inst.getUiAutomation().takeScreenshot();assertNotNull(baseline);
            int band=read(s,a->Math.round(28*a.getResources().getDisplayMetrics().density));
            try{
                swipe(baseline.getWidth()/4f,1,baseline.getWidth()/4f,band*2.5f);
                waitFor(()->stripDifference(baseline,band)>0.008,"top edge actually reveals transient system UI");
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
    private double stripDifference(Bitmap baseline,int band){
        Bitmap shot=inst.getUiAutomation().takeScreenshot();if(shot==null)return 1;
        try{
            if(shot.getWidth()!=baseline.getWidth()||shot.getHeight()!=baseline.getHeight())return 1;
            int changed=0,total=0;
            for(int y=2;y<Math.min(band,shot.getHeight());y+=2)for(int x=4;x<shot.getWidth()-4;x+=2){
                int a=baseline.getPixel(x,y),b=shot.getPixel(x,y);total++;
                if(Math.abs(android.graphics.Color.red(a)-android.graphics.Color.red(b))+Math.abs(android.graphics.Color.green(a)-android.graphics.Color.green(b))+Math.abs(android.graphics.Color.blue(a)-android.graphics.Color.blue(b))>60)changed++;
            }
            return changed/(double)Math.max(total,1);
        }finally{shot.recycle();}
    }
    private String js(ActivityScenario<MainActivity> s,String code){
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        s.onActivity(a->((WebView)get(a,"web")).evaluateJavascript(code,v->{result.set(v);done.countDown();}));
        try{assertTrue(done.await(5,TimeUnit.SECONDS));}catch(InterruptedException e){throw new AssertionError(e);}return result.get();
    }
    private interface Reader<T>{T apply(MainActivity a);}
    private <T>T read(ActivityScenario<MainActivity>s,Reader<T> fn){AtomicReference<T> r=new AtomicReference<>();s.onActivity(a->r.set(fn.apply(a)));return r.get();}
    private void waitFor(BooleanSupplier check,String message)throws Exception{waitFor(check,message,10000);}
    private void waitFor(BooleanSupplier check,String message,int timeout)throws Exception{long end=SystemClock.uptimeMillis()+timeout;while(SystemClock.uptimeMillis()<end){if(check.getAsBoolean())return;Thread.sleep(100);}fail(message);}
    private static void stopPoll(MainActivity a){set(a,"foreground",false);((Handler)get(a,"handler")).removeCallbacks((Runnable)get(a,"poll"));}
    private static Object get(MainActivity a,String n){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);return f.get(a);}catch(Exception e){throw new AssertionError(e);}}
    private static void set(MainActivity a,String n,Object v){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);f.set(a,v);}catch(Exception e){throw new AssertionError(e);}}
    private static Object call(MainActivity a,String n,Class<?>[] types,Object...args){try{Method m=MainActivity.class.getDeclaredMethod(n,types);m.setAccessible(true);return m.invoke(a,args);}catch(Exception e){throw new AssertionError(e);}}
}
