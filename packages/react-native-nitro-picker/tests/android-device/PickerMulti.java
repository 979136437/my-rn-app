import android.graphics.Point;
import android.graphics.Rect;
import android.os.SystemClock;
import com.android.uiautomator.core.UiObject;
import com.android.uiautomator.core.UiSelector;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;
import java.io.File;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PickerMulti extends UiAutomatorTestCase {
  static class Adjustable extends UiObject {
    Adjustable() { super(new UiSelector().resourceId("picker-tests-text")); }
    boolean adjust(int action) {
      android.view.accessibility.AccessibilityNodeInfo node = findAccessibilityNodeInfo(1000);
      return node != null && node.performAction(action);
    }
  }
  public void testAccessibilityAdjustments() throws Exception {
    new UiObject(new UiSelector().text("程序选首项")).click();
    SystemClock.sleep(700);
    Adjustable column = new Adjustable();
    column.adjust(android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);
    SystemClock.sleep(700);
    String increased = new UiObject(new UiSelector().resourceId("picker-tests-controlled")).getText();
    System.out.println("ACCESSIBILITY_INCREMENT=" + increased);
    assertTrue("Increment updated controlled selection", increased.contains("[1, 0]"));
    column.adjust(android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);
    SystemClock.sleep(700);
    String decreased = new UiObject(new UiSelector().resourceId("picker-tests-controlled")).getText();
    System.out.println("ACCESSIBILITY_DECREMENT=" + decreased);
    assertTrue("Decrement updated controlled selection", decreased.contains("[0, 0]"));
  }
  public void testSimultaneousColumns() throws Exception {
    new UiObject(new UiSelector().text("程序选首项")).click();
    new UiObject(new UiSelector().text("清空日志")).click();
    SystemClock.sleep(700);
    UiObject wheel = new UiObject(new UiSelector().resourceId("picker-tests-wheel"));
    Rect r = wheel.getBounds();
    int x1 = r.left + r.width() / 4;
    int x2 = r.left + r.width() * 3 / 4;
    int fromY = r.centerY() + r.height() / 5;
    int toY = r.centerY() - r.height() / 5;
    assertTrue("Two-pointer injection", wheel.performTwoPointerGesture(
      new Point(x1, fromY), new Point(x2, fromY),
      new Point(x1, toY), new Point(x2, toY), 80));
    SystemClock.sleep(1800);
    String state = new UiObject(new UiSelector().resourceId("picker-tests-controlled")).getText();
    System.out.println("SIMULTANEOUS_STATE=" + state);
    Matcher match = Pattern.compile("\\[(\\d+), (\\d+)\\]").matcher(state);
    assertTrue("Controlled value is visible", match.find());
    assertTrue("Left column changed", Integer.parseInt(match.group(1)) > 0);
    assertTrue("Right column changed", Integer.parseInt(match.group(2)) > 0);
    getUiDevice().takeScreenshot(new File("/sdcard/codex-picker-multi.png"));
  }
}
