package com.axiom.android;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Rect;
import java.util.List;
import static org.junit.Assert.*;

/** Optical oracle for the solid synthetic WebView, never for user content.
 * Insets select regions only: requested visibility is NOT proof of hidden bars. */
final class SystemBarProbe {
    final Rect top, navigation, web, dialog;
    final List<Rect> cutouts;
    final int width,height,purple,canvas;
    SystemBarProbe(int width,int height,Rect web,Rect dialog,List<Rect> cutouts,
            int statusHeight,androidx.core.graphics.Insets nav,float dim){
        this.width=width;this.height=height;this.web=web;this.dialog=dialog;this.cutouts=cutouts;
        purple=dim(0xff5e6ad2,dim);canvas=dim(0xff010102,dim);
        top=new Rect(4,2,width-4,Math.max(3,statusHeight));
        if(nav.right>0)navigation=new Rect(width-nav.right,4,width-2,height-4);
        else if(nav.left>0)navigation=new Rect(2,4,nav.left,height-4);
        else {assertTrue("navigation edge geometry available",nav.bottom>0);navigation=new Rect(4,height-nav.bottom,width-4,height-2);}
    }
    private static int dim(int color,float amount){
        float f=1-amount;return Color.rgb(Math.round(Color.red(color)*f),Math.round(Color.green(color)*f),Math.round(Color.blue(color)*f));
    }
    private static int distance(int a,int b){return Math.abs(Color.red(a)-Color.red(b))+Math.abs(Color.green(a)-Color.green(b))+Math.abs(Color.blue(a)-Color.blue(b));}
    private boolean masked(int x,int y){
        // Generic CI devices have square screens. Exclude physical cutouts and the
        // floating dialog/shadow, but never a whole system-bar region.
        if(dialog!=null&&dialog.contains(x,y))return true;
        for(Rect r:cutouts)if(r.contains(x,y))return true;
        return false;
    }
    boolean hidden(Bitmap shot){return mismatch(shot,top)==0&&mismatch(shot,navigation)==0;}
    private int mismatch(Bitmap shot,Rect roi){
        assertSize(shot);int count=0,samples=0;
        for(int y=roi.top;y<roi.bottom;y+=2)for(int x=roi.left;x<roi.right;x+=2){
            if(masked(x,y))continue;samples++;
            if(distance(shot.getPixel(x,y),web.contains(x,y)?purple:canvas)>30)count++;
        }
        assertTrue("unmasked edge samples "+roi,samples>100);
        return count;
    }
    double difference(Bitmap a,Bitmap b,Rect roi){
        assertSize(a);assertSize(b);int changes=0,samples=0;
        for(int y=roi.top;y<roi.bottom;y+=2)for(int x=roi.left;x<roi.right;x+=2){
            if(masked(x,y))continue;samples++;
            if(distance(a.getPixel(x,y),b.getPixel(x,y))>60)changes++;
        }
        assertTrue("edge difference samples",samples>100);return changes/(double)samples;
    }
    void assertBackgroundStable(Bitmap shot){
        // Exclude both system-bar edges and dialog/shadow. A changed scrim or
        // removed dialog is not evidence that a system bar has been revealed.
        assertSize(shot);int samples=0,changes=0;
        for(int y=top.bottom+4;y<height-4;y+=2)for(int x=4;x<width-4;x+=2){
            if(masked(x,y)||navigation.contains(x,y)||top.contains(x,y))continue;
            // Keep four pixels away from a side/bottom navigation region too.
            if(x>=navigation.left-4&&x<navigation.right+4&&y>=navigation.top-4&&y<navigation.bottom+4)continue;
            samples++;
            if(distance(shot.getPixel(x,y),web.contains(x,y)?purple:canvas)>30)changes++;
        }
        assertTrue("unmasked background samples",samples>100);
        assertEquals("stable background/scrim outside system bars",0,changes);
    }
    private void assertSize(Bitmap b){assertNotNull("screen screenshot",b);assertEquals(width,b.getWidth());assertEquals(height,b.getHeight());}
}
