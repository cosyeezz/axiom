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
    private static boolean evidenceTransportVerified;
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
        accessibilityFlags=info.flags;info.flags|=AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS|AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        inst.getUiAutomation().setServiceInfo(info);
        verifyEvidenceTransport();
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
        if(workspace)waitVisualState(s);
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
            // Some WebViews blur the editor and close IME on button activation,
            // others retain it. Wait for either state to settle before taking new
            // coordinates; taps==1 alone is not an IME/layout completion barrier.
            waitComposerStable(s);waitVisualState(s);
            Rect draftTap=element(s,"draft");
            android.util.Log.i("ImmersiveEvidence","draft retap="+draftTap+" DOM="+composerGeometry(s));
            logGeometry("before draft retap");tap(draftTap);
            waitFor(()->"\"draft\"".equals(js(s,"document.activeElement.id")),"retap focuses draft");
            waitFor(()->imeBounds()!=null,"IME before Back");
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
            // Remove fixture controls only, leaving a predictable optical background
            // at BOTH edges, including landscape navigation on the side.
            js(s,"composer.style.visibility='hidden'");
            SystemBarProbe probe=barProbe(s,null);
            assertTransientCycle(s,probe,probe.top,"activity-top",null);
            assertTransientCycle(s,probe,probe.navigation,"activity-navigation",null);
            assertEquals(before,read(s,a->bounds((View)get(a,"web"))));
            assertEquals(content,js(s,"draft.value+'|'+sentinel"));waitBarsHidden(s);
        }
    }
    @Test public void nativeDialogCancelRestoresImmersiveWorkspace() throws Exception {
        try(ActivityScenario<MainActivity> s=launch(true)){
            js(s,"draft.value='dialog-draft'");String before=js(s,"draft.value+'|'+sentinel");
            WebView web=read(s,a->(WebView)get(a,"web"));waitBarsHidden(s);
            inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            waitFor(()->read(s,a->get(a,"connectionPanel")!=null),"Back opens native settings");
            android.app.AlertDialog panel=read(s,a->(android.app.AlertDialog)get(a,"connectionPanel"));
            waitFor(()->read(s,a->panel.isShowing()&&panel.getWindow().getDecorView().hasWindowFocus()&&!a.hasWindowFocus()),"settings owns focus");
            js(s,"composer.style.visibility='hidden'");
            SystemBarProbe probe=barProbe(s,panel);
            assertTransientCycle(s,probe,probe.navigation,"dialog-navigation",panel);
            String[] actions={"panelReload","panelSwitch","panelClear"};
            String[] titles={"刷新页面？","切换电脑？","清除本机登录？"};
            for(int i=0;i<actions.length;i++){
                final String action=actions[i],title=titles[i];
                // Keep preparation deterministic; still inject one real touch.
                s.onActivity(a->{View button=(View)get(a,action);button.requestRectangleOnScreen(new Rect(0,0,button.getWidth(),button.getHeight()),true);});
                Rect actionBounds=read(s,a->visibleBounds((View)get(a,action)));
                tap(actionBounds);
                waitFor(()->focusedDialogHasTitle(title),"confirmation focus "+action);
                for(String id:new String[]{"android:id/button1","android:id/button2"})assertControlSafe(s,focusedControl(id));
                tap(focusedControl("android:id/button2"));
                waitFor(()->read(s,a->panel.isShowing()&&panel.getWindow().getDecorView().hasWindowFocus()),"cancel returns to settings");
                assertSame(web,read(s,a->(WebView)get(a,"web")));
                assertEquals(before,js(s,"draft.value+'|'+sentinel"));
            }
            Rect close=read(s,a->visibleBounds(panel.getButton(android.app.AlertDialog.BUTTON_NEGATIVE)));
            assertControlSafe(s,close);tap(close);
            waitFor(()->read(s,a->get(a,"connectionPanel")==null&&a.hasWindowFocus()),"dialog closed");
            s.onActivity(a->assertSame(web,get(a,"web")));
            assertEquals(before,js(s,"draft.value+'|'+sentinel"));waitBarsHidden(s);assertSafeArea(s);
        }
    }
    private static Rect visibleBounds(View view){
        Rect visible=new Rect();assertTrue("control enabled",view.isEnabled());
        assertTrue("control visible",view.getLocalVisibleRect(visible));
        assertEquals("control wholly visible",new Rect(0,0,view.getWidth(),view.getHeight()),visible);return bounds(view);
    }
    private android.view.accessibility.AccessibilityNodeInfo focusedDialogRoot(){
        for(AccessibilityWindowInfo w:inst.getUiAutomation().getWindows())try{
            if(w.getType()==AccessibilityWindowInfo.TYPE_APPLICATION&&w.isFocused()){
                android.view.accessibility.AccessibilityNodeInfo root=w.getRoot();
                if(root!=null){if("com.axiom.android".equals(String.valueOf(root.getPackageName())))return root;root.recycle();}
            }
        }finally{w.recycle();}
        return null;
    }
    private boolean focusedDialogHasTitle(String title){
        android.view.accessibility.AccessibilityNodeInfo root=focusedDialogRoot();if(root==null)return false;
        try{
            java.util.List<android.view.accessibility.AccessibilityNodeInfo> nodes=root.findAccessibilityNodeInfosByText(title);
            boolean found=false;for(android.view.accessibility.AccessibilityNodeInfo node:nodes){found|=title.contentEquals(node.getText()==null?"":node.getText());node.recycle();}return found;
        }finally{root.recycle();}
    }
    private Rect focusedControl(String id){
        android.view.accessibility.AccessibilityNodeInfo root=focusedDialogRoot();assertNotNull(root);
        try{
            java.util.List<android.view.accessibility.AccessibilityNodeInfo> nodes=root.findAccessibilityNodeInfosByViewId(id);
            assertEquals("one focused dialog control "+id,1,nodes.size());
            android.view.accessibility.AccessibilityNodeInfo node=nodes.get(0);
            try{assertTrue(node.isVisibleToUser());assertTrue(node.isEnabled());Rect r=new Rect();node.getBoundsInScreen(r);assertFalse(r.isEmpty());return r;}finally{node.recycle();}
        }finally{root.recycle();}
    }
    private void assertControlSafe(ActivityScenario<MainActivity> s,Rect control){
        Bitmap shot=inst.getUiAutomation().takeScreenshot();assertNotNull(shot);
        try{s.onActivity(a->{
            Rect safe=new Rect(0,0,shot.getWidth(),shot.getHeight());
            CutoutSnapshot cutout=cutoutSnapshot(a,safe);
            if("true".equals(InstrumentationRegistry.getArguments().getString("requireCutout")))assertNotNull("display cutout",cutout);
            if(cutout!=null){
                safe.set(cutout.safeFrame);
                for(Rect r:cutout.rects)assertFalse("control avoids cutout",Rect.intersects(r,control));
            }
            assertTrue("control "+control+" inside display safe area "+safe,safe.contains(control));
        });}finally{shot.recycle();}
    }
    // JUnit scans every outer method signature before running SDK guards. Do not
    // expose DisplayCutout there: the class does not exist on API26/27.
    private static final class CutoutSnapshot {
        final Rect safeFrame;
        final java.util.List<Rect> rects=new java.util.ArrayList<>();
        CutoutSnapshot(Rect frame){safeFrame=new Rect(frame);}
    }
    private CutoutSnapshot cutoutSnapshot(MainActivity a,Rect display){
        return Build.VERSION.SDK_INT>=28?Api28Cutout.snapshot(a,display):null;
    }
    @androidx.annotation.RequiresApi(28)
    private static final class Api28Cutout {
        static CutoutSnapshot snapshot(MainActivity a,Rect display){
            WindowInsets insets=a.getWindow().getDecorView().getRootWindowInsets();
            android.view.DisplayCutout cutout=Build.VERSION.SDK_INT>=29?Api29Cutout.get(a):(insets==null?null:insets.getDisplayCutout());
            if(cutout==null)return null;
            // API28 uses Activity-window coordinates, API29+ display coordinates.
            Rect frame=Build.VERSION.SDK_INT>=29?new Rect(display):bounds(a.getWindow().getDecorView());
            CutoutSnapshot result=new CutoutSnapshot(frame);
            result.safeFrame.set(frame.left+cutout.getSafeInsetLeft(),frame.top+cutout.getSafeInsetTop(),frame.right-cutout.getSafeInsetRight(),frame.bottom-cutout.getSafeInsetBottom());
            for(Rect rect:cutout.getBoundingRects()){
                Rect r=new Rect(rect);if(Build.VERSION.SDK_INT==28)r.offset(frame.left,frame.top);result.rects.add(r);
            }
            return result;
        }
    }
    @androidx.annotation.RequiresApi(29)
    private static final class Api29Cutout {
        static android.view.DisplayCutout get(MainActivity a){return a.getWindowManager().getDefaultDisplay().getCutout();}
    }
    private SystemBarProbe barProbe(ActivityScenario<MainActivity> s,android.app.AlertDialog dialog){
        Bitmap shot=inst.getUiAutomation().takeScreenshot();assertNotNull(shot);
        try{return read(s,a->{
            WindowInsetsCompat i=ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());assertNotNull(i);
            androidx.core.graphics.Insets nav=i.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.navigationBars());
            int status=Math.max(Math.round(24*a.getResources().getDisplayMetrics().density),i.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.statusBars()).top);
            CutoutSnapshot cutout=cutoutSnapshot(a,new Rect(0,0,shot.getWidth(),shot.getHeight()));
            java.util.List<Rect> cuts=cutout==null?new java.util.ArrayList<>():cutout.rects;
            Rect d=dialog==null?null:bounds(dialog.getWindow().getDecorView());
            if(d!=null)d.inset(-16,-16);
            float dim=dialog==null?0:dialog.getWindow().getAttributes().dimAmount;
            android.util.Log.i("ImmersiveEvidence","bar regions status="+status+" navigation="+nav+" dialog="+d+" dim="+dim+" cutouts="+cuts);
            return new SystemBarProbe(shot.getWidth(),shot.getHeight(),bounds((View)get(a,"web")),d,cuts,status,nav,dim);
        });}finally{shot.recycle();}
    }
    private void assertTransientCycle(ActivityScenario<MainActivity> s,SystemBarProbe probe,Rect edge,String name,android.app.AlertDialog dialog)throws Exception{
        int[] stable={0};
        waitFor(()->{
            Bitmap shot=inst.getUiAutomation().takeScreenshot();assertNotNull(shot);
            try{stable[0]=probe.hidden(shot)?stable[0]+1:0;return stable[0]>=4;}finally{shot.recycle();}
        },name+" optical hidden baseline");
        Bitmap baseline=inst.getUiAutomation().takeScreenshot();assertNotNull(baseline);saveScreenshot(baseline,name+"-hidden");
        View decor=read(s,a->dialog==null?a.getWindow().getDecorView():dialog.getWindow().getDecorView());
        java.util.concurrent.atomic.AtomicBoolean lostFocus=new java.util.concurrent.atomic.AtomicBoolean(false);
        android.view.ViewTreeObserver.OnWindowFocusChangeListener listener=focused->{if(!focused)lostFocus.set(true);};
        s.onActivity(a->decor.getViewTreeObserver().addOnWindowFocusChangeListener(listener));
        Rect before=read(s,a->bounds((View)get(a,"web")));
        try{
            if(edge==probe.top)swipe(probe.width/4f,1,probe.width/4f,edge.bottom*2.5f);
            else if(edge.right==probe.width-2)swipe(probe.width-1,probe.height/2f,probe.width-edge.width()*2.5f,probe.height/2f);
            else if(edge.left==2)swipe(1,probe.height/2f,edge.width()*2.5f,probe.height/2f);
            else swipe(probe.width/2f,probe.height-1,probe.width/2f,probe.height-edge.height()*2.5f);
            waitFor(()->{
                assertFalse("no focus-mediated re-hide",lostFocus.get());
                assertEquals("transient layout unchanged",before,read(s,a->bounds((View)get(a,"web"))));
                Bitmap shot=inst.getUiAutomation().takeScreenshot();assertNotNull(shot);
                try{return probe.difference(baseline,shot,edge)>0.008;}finally{shot.recycle();}
            },name+" visibly revealed");
            Bitmap revealed=inst.getUiAutomation().takeScreenshot();try{saveScreenshot(revealed,name+"-revealed");}finally{revealed.recycle();}
            stable[0]=0;
            // No hide/tap/Back/lifecycle operation during the measured interval.
            waitFor(()->{
                assertFalse("no focus-mediated re-hide",lostFocus.get());
                assertEquals("transient layout unchanged",before,read(s,a->bounds((View)get(a,"web"))));
                Bitmap shot=inst.getUiAutomation().takeScreenshot();assertNotNull(shot);
                try{stable[0]=probe.difference(baseline,shot,edge)<0.004&&probe.hidden(shot)?stable[0]+1:0;return stable[0]>=4;}finally{shot.recycle();}
            },name+" automatically hidden",20000);
            Bitmap restored=inst.getUiAutomation().takeScreenshot();try{saveScreenshot(restored,name+"-restored");}finally{restored.recycle();}
        }finally{s.onActivity(a->decor.getViewTreeObserver().removeOnWindowFocusChangeListener(listener));baseline.recycle();}
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
    private void verifyEvidenceTransport()throws Exception{
        if(evidenceTransportVerified)return;
        assertEquals("a b",shell("printf '%s' 'a b'"));
        boolean rejected=false;
        try{shell("exit 7");}catch(AssertionError expected){
            assertTrue(expected.getMessage().contains("AXIOM_SHELL_EXIT=7"));rejected=true;
        }
        assertTrue("nonzero shell status rejected",rejected);
        // Deterministic incompressible fixture exercises more than one transfer
        // chunk on EVERY API, not just large screenshots on some devices.
        Bitmap bitmap=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);
        java.util.Random random=new java.util.Random(26);
        for(int y=0;y<64;y++)for(int x=0;x<64;x++)bitmap.setPixel(x,y,0xff000000|random.nextInt(0x1000000));
        try{
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes));
            assertTrue("multi-chunk fixture",bytes.size()>8192);
            saveScreenshot(bitmap,"capture-protocol");
        }finally{bitmap.recycle();}
        evidenceTransportVerified=true;
    }
    private void saveScreenshot(Bitmap bitmap,String name)throws Exception{
        assertTrue("safe evidence name",name.matches("[a-z0-9-]+"));
        java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();
        assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes));
        String encoded=android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP);
        String path="/sdcard/Download/axiom-immersive/"+name+".png";
        // Shell cannot reliably read app external-files under scoped storage.
        // Transfer the exact measured bitmap, with bounded command sizes, rather
        // than silently cp-ing or taking a different frame after the assertion.
        shell("mkdir -p /sdcard/Download/axiom-immersive && : > "+path+".b64");
        for(int start=0;start<encoded.length();start+=8192){
            shell("printf '%s' '"+encoded.substring(start,Math.min(start+8192,encoded.length()))+"' >> "+path+".b64");
        }
        shell("base64 -d "+path+".b64 > "+path+" && rm "+path+".b64 && test -s "+path);
        assertArrayEquals("persisted screenshot bytes",bytes.toByteArray(),android.util.Base64.decode(shell("base64 "+path),android.util.Base64.DEFAULT));
    }
    private String shell(String command)throws Exception{
        String wrapped="("+command+") 2>&1; rc=$?; printf '\\nAXIOM_SHELL_EXIT=%s\\n' \"$rc\"";
        // UiAutomationConnection uses Runtime.exec(String), which splits on
        // whitespace without interpreting quotes (including API26 and API30).
        // Keep the bootstrap a single token; only the inner shell expands IFS.
        String script64=android.util.Base64.encodeToString(wrapped.getBytes(java.nio.charset.StandardCharsets.UTF_8),android.util.Base64.NO_WRAP);
        String bootstrap="printf${IFS}%s${IFS}"+script64+"|/system/bin/base64${IFS}-d|/system/bin/sh";
        try(java.io.InputStream stream=new android.os.ParcelFileDescriptor.AutoCloseInputStream(inst.getUiAutomation().executeShellCommand("/system/bin/sh -c "+bootstrap))){
            java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();
            byte[] buffer=new byte[4096];int count;while((count=stream.read(buffer))!=-1)output.write(buffer,0,count);
            String text=output.toString("UTF-8"),marker="\nAXIOM_SHELL_EXIT=0\n";
            assertTrue("shell evidence command failed: "+text,text.endsWith(marker));
            return text.substring(0,text.length()-marker.length());
        }
    }
    private void waitVisualState(ActivityScenario<MainActivity> s)throws Exception{
        CountDownLatch drawn=new CountDownLatch(1);
        s.onActivity(a->((WebView)get(a,"web")).postVisualStateCallback(1,new WebView.VisualStateCallback(){
            @Override public void onComplete(long id){drawn.countDown();}
        }));
        assertTrue("fixture drawn",drawn.await(10,TimeUnit.SECONDS));
    }
    private String composerGeometry(ActivityScenario<MainActivity> s){
        return js(s,"(()=>{const r=draft.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight,window.visualViewport?window.visualViewport.height:innerHeight,document.activeElement.id]})()");
    }
    private void waitComposerStable(ActivityScenario<MainActivity> s)throws Exception{
        String[] previous={""};int[] stable={0};
        waitFor(()->{
            String dom=composerGeometry(s);
            String nativeGeometry=read(s,a->{
                WindowInsetsCompat i=ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());
                if(!a.hasWindowFocus()||i==null||i.isVisible(WindowInsetsCompat.Type.ime())!=(imeBounds()!=null))return "";
                View root=(View)get(a,"root");
                return bounds((View)get(a,"web"))+"|"+root.getPaddingBottom()+"|"+i.getInsets(WindowInsetsCompat.Type.ime());
            });
            boolean fits=false;
            try{
                JSONArray d=new JSONArray(dom);Rect web=read(s,a->bounds((View)get(a,"web")));
                fits=Math.abs(d.getDouble(5)*web.width()/d.getDouble(4)-web.height())<=1;
            }catch(Exception e){throw new AssertionError(e);}
            String current=dom+"|"+nativeGeometry;
            stable[0]=fits&&!nativeGeometry.isEmpty()&&current.equals(previous[0])?stable[0]+1:0;previous[0]=current;
            return stable[0]>=8;
        },"composer DOM and native geometry stable");
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
        AssertionError assertion=null;
        try{while(SystemClock.uptimeMillis()<end){if(check.getAsBoolean())return;Thread.sleep(100);}}
        catch(AssertionError error){assertion=error;}
        logGeometry(message);
        // Capture before try-with-resources closes the Activity. The shell trap's
        // final screenshot otherwise contains only the launcher, losing the failure.
        String path="/sdcard/Download/axiom-immersive/"+message.replaceAll("[^A-Za-z0-9]+","-");
        try{
            shell("mkdir -p /sdcard/Download/axiom-immersive");
            shell("screencap -p "+path+".png");
            captureText("dumpsys window",path+"-window.txt");
            captureText("dumpsys input_method",path+"-ime.txt");
        }catch(Exception|AssertionError e){android.util.Log.w("ImmersiveEvidence","capture failed",e);}
        if(assertion!=null)throw assertion;
        fail(message);
    }
    private void captureText(String command,String destination)throws Exception{
        shell(command+" > "+destination+" && test -s "+destination);
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
