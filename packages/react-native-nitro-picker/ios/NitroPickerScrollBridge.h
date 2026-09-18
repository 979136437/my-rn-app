#import <UIKit/UIKit.h>

@interface NitroPickerScrollBridge : NSObject
+ (nullable UIScrollView *)scrollViewForTag:(NSInteger)tag NS_SWIFT_NAME(scrollView(forTag:));
+ (void)addDelegate:(id<UIScrollViewDelegate>)delegate toScrollView:(UIScrollView *)scrollView NS_SWIFT_NAME(add(_:to:));
+ (void)removeDelegate:(id<UIScrollViewDelegate>)delegate fromScrollView:(UIScrollView *)scrollView NS_SWIFT_NAME(remove(_:from:));
@end
