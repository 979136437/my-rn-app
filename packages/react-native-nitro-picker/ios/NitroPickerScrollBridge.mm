#import "NitroPickerScrollBridge.h"

#import <React/RCTScrollViewComponentView.h>

@implementation NitroPickerScrollBridge

+ (UIView *)findTag:(NSInteger)tag inView:(UIView *)view {
  if (view.tag == tag) return view;
  for (UIView *child in view.subviews) {
    UIView *found = [self findTag:tag inView:child];
    if (found) return found;
  }
  return nil;
}

+ (UIScrollView *)scrollViewForTag:(NSInteger)tag {
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      UIView *view = [self findTag:tag inView:window];
      if ([view isKindOfClass:RCTScrollViewComponentView.class]) {
        return ((RCTScrollViewComponentView *)view).scrollView;
      }
    }
  }
  return nil;
}

+ (RCTScrollViewComponentView *)ownerOf:(UIScrollView *)scrollView {
  UIView *parent = scrollView.superview;
  return [parent isKindOfClass:RCTScrollViewComponentView.class] ? (RCTScrollViewComponentView *)parent : nil;
}

+ (void)addDelegate:(id<UIScrollViewDelegate>)delegate toScrollView:(UIScrollView *)scrollView {
  [[self ownerOf:scrollView].scrollViewDelegateSplitter addDelegate:delegate];
}

+ (void)removeDelegate:(id<UIScrollViewDelegate>)delegate fromScrollView:(UIScrollView *)scrollView {
  [[self ownerOf:scrollView].scrollViewDelegateSplitter removeDelegate:delegate];
}
@end
