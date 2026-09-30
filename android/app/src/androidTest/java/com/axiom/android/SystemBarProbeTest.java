package com.axiom.android;

import android.graphics.Bitmap;
import android.graphics.Rect;
import androidx.core.graphics.Insets;
import java.util.Collections;
import org.junit.Test;
import static org.junit.Assert.*;

/** Tests the oracle with synthetic pixels; not a substitute for real SystemUI tests. */
public final class SystemBarProbeTest {
    private static Bitmap frame(int width,int height,int color){
        Bitmap b=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);b.eraseColor(color);return b;
    }
    private static void fill(Bitmap b,Rect r,int color){
        for(int y=r.top;y<r.bottom;y++)for(int x=r.left;x<r.right;x++)b.setPixel(x,y,color);
    }
    @Test public void rejectsScrimRemovalAsBarReveal(){
        SystemBarProbe p=new SystemBarProbe(320,640,new Rect(0,0,320,640),new Rect(0,79,320,561),
            Collections.emptyList(),24,Insets.of(0,0,0,24),0.6f);
        Bitmap hidden=frame(320,640,p.purple),removed=frame(320,640,0xff5e6ad2),revealed=frame(320,640,p.purple);
        try{
            assertTrue(p.hidden(hidden));p.assertBackgroundStable(hidden);
            assertTrue("old reveal-only test would accept scrim removal",p.difference(hidden,removed,p.navigation)>0.008);
            assertThrows(AssertionError.class,()->p.assertBackgroundStable(removed));
            fill(revealed,p.navigation,0xff000000);
            assertFalse(p.hidden(revealed));assertTrue(p.difference(hidden,revealed,p.navigation)>0.008);
            p.assertBackgroundStable(revealed);
        }finally{hidden.recycle();removed.recycle();revealed.recycle();}
    }
    @Test public void masksCutoutDialogAndSideNavigationButNotBackground(){
        SystemBarProbe p=new SystemBarProbe(640,320,new Rect(0,0,640,320),new Rect(180,60,440,260),
            Collections.singletonList(new Rect(280,0,360,35)),24,Insets.of(0,0,24,0),0.6f);
        Bitmap b=frame(640,320,p.purple);
        try{
            fill(b,p.dialog,0xffffffff);fill(b,p.cutouts.get(0),0xff000000);
            assertTrue(p.hidden(b));p.assertBackgroundStable(b);
            fill(b,p.navigation,0xff000000);assertFalse(p.hidden(b));p.assertBackgroundStable(b);
            fill(b,new Rect(40,80,50,90),0xffffffff);
            assertThrows(AssertionError.class,()->p.assertBackgroundStable(b));
        }finally{b.recycle();}
    }
}
