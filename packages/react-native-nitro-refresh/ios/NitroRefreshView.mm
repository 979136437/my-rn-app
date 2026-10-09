#import "NitroRefreshView.h"
#import "NitroRefresh-Swift-Cxx-Umbrella.hpp"
#import <React/RCTScrollViewComponentView.h>
#import <MJRefresh/MJRefresh.h>
#import <react/renderer/components/NitroRefreshSpec/ComponentDescriptors.h>
#import <react/renderer/components/NitroRefreshSpec/Props.h>

using namespace facebook::react;

// Must match the JS/Fabric default height (dp/points).
static const CGFloat NRDefaultHeaderHeight = 60;

// Based on RCTMJRefreshHeader's state/progress hooks, using current MJRefresh.
@interface NRRefreshHeader : MJRefreshHeader
@property (nonatomic, copy) void (^stateChanged)(NSString *);
@property (nonatomic, copy) void (^moved)(CGFloat, CGFloat, BOOL);
@property (nonatomic, copy) void (^willRefresh)(void);
@property (nonatomic, assign) BOOL ending;
@end

@implementation NRRefreshHeader
- (void)setState:(MJRefreshState)state {
  if (state == self.state) return;
  if (state == MJRefreshStateRefreshing && self.willRefresh) self.willRefresh();
  [super setState:state];
  if (!self.stateChanged) return;
  if (self.ending) self.stateChanged(@"finishing");
  else if (state == MJRefreshStateRefreshing || state == MJRefreshStateWillRefresh) self.stateChanged(@"refreshing");
  else if (state == MJRefreshStatePulling) self.stateChanged(@"ready");
  else self.stateChanged(self.pullingPercent > 0 ? @"pulling" : @"idle");
}
- (void)setPullingPercent:(CGFloat)percent {
  [super setPullingPercent:percent];
  if (!self.isRefreshing && !self.ending && self.stateChanged) {
    self.stateChanged(percent >= 1 ? @"ready" : (percent > 0 ? (self.scrollView.isDragging ? @"pulling" : @"finishing") : @"idle"));
  }
}
- (void)scrollViewContentOffsetDidChange:(NSDictionary *)change {
  // Preserve the resting inset while MJRefresh restores the refreshing inset.
  if (!self.ending) [super scrollViewContentOffsetDidChange:change];
  CGFloat offset = MAX(0, -self.scrollView.contentOffset.y - self.scrollViewOriginalInset.top);
  if (self.moved) self.moved(offset, self.bounds.size.height, self.scrollView.isDragging);
  if (!self.isRefreshing && !self.ending && offset == 0) self.pullingPercent = 0;
}
- (void)layoutSubviews {
  [super layoutSubviews];
  // React owns the header subtree; the native library owns its outer position.
  for (UIView *child in self.subviews) child.frame = self.bounds;
}
@end

@interface NitroRefreshView () <NRRefreshTarget, UIGestureRecognizerDelegate>
@end

@implementation NitroRefreshView {
  NSString *_controllerId;
  UIView<RCTComponentViewProtocol> *_headerSlot;
  __weak UIScrollView *_scrollView;
  NRRefreshHeader *_header;
  UIPanGestureRecognizer *_scrollLockPan;
  BOOL _enabled;
  BOOL _active;
  BOOL _notifyNext;
  BOOL _bindingScheduled;
  BOOL _originalBounce;
  CGFloat _originalInsetTop;
  CGFloat _headerHeight;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<NitroRefreshViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _props = std::make_shared<const NitroRefreshViewProps>();
    _controllerId = @"";
    _enabled = YES;
    _notifyNext = YES;
    _headerHeight = NRDefaultHeaderHeight;
    // This Fabric node manages the header attached to the UIScrollView.
    self.hidden = YES;
    self.userInteractionEnabled = NO;
  }
  return self;
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)child index:(NSInteger)index {
  NSAssert(index == 0 && !_headerSlot, @"NitroRefreshControl expects one header");
  _headerSlot = child;
  if (_header) [_header addSubview:child];
  [self scheduleBinding];
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)child index:(NSInteger)index {
  [self detachScrollView];
  _headerSlot = nil;
  [child removeFromSuperview];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &next = *std::static_pointer_cast<const NitroRefreshViewProps>(props);
  NSString *identifier = [NSString stringWithUTF8String:next.controllerId.c_str()];
  if (![_controllerId isEqualToString:identifier]) {
    [self detachScrollView];
    _controllerId = identifier;
  }
  _enabled = next.enabled;
  _headerHeight = next.headerHeight;
  if (_header) {
    CGRect frame = _header.frame;
    frame.size.height = _headerHeight;
    _header.frame = frame;
    _header.hidden = !_enabled && !_active;
    [_header setNeedsLayout];
  }
  [super updateProps:props oldProps:oldProps];
  self.hidden = YES;
  [self scheduleBinding];
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask {
  [super finalizeUpdates:updateMask];
  [self scheduleBinding];
}
- (void)layoutSubviews {
  [super layoutSubviews];
  [self scheduleBinding];
}
- (void)didMoveToSuperview {
  [super didMoveToSuperview];
  if (self.superview) [self scheduleBinding]; else [self detachScrollView];
}
- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (self.window) [self scheduleBinding]; else [self detachScrollView];
}

- (void)scheduleBinding {
  if (_bindingScheduled) return;
  _bindingScheduled = YES;
  __weak NitroRefreshView *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    NitroRefreshView *view = weakSelf;
    if (!view) return;
    view->_bindingScheduled = NO;
    [view bindScrollView];
  });
}

- (void)bindScrollView {
  if (!self.window || !_headerSlot || _controllerId.length == 0) return;
  UIScrollView *next = [RCTScrollViewComponentView findScrollViewComponentViewForView:self].scrollView;
  if (!next) return;
  if (next != _scrollView) {
    [self detachScrollView];
    NSAssert(next.mj_header == nil && next.refreshControl == nil, @"A scroll view can have only one refresh control");
    _scrollView = next;
    _originalBounce = next.alwaysBounceVertical;
    _header = [NRRefreshHeader new];
    CGRect frame = _header.frame;
    frame.size.height = _headerHeight;
    _header.frame = frame;
    _header.hidden = !_enabled;
    _header.automaticallyChangeAlpha = NO;
    [_header addSubview:_headerSlot];
    __weak NitroRefreshView *weakSelf = self;
    _header.willRefresh = ^{
      NitroRefreshView *view = weakSelf;
      if (!view) return;
      view->_originalInsetTop = view->_scrollView.contentInset.top;
      view->_active = YES;
      [view setScrollLocked:YES];
    };
    _header.stateChanged = ^(NSString *state) {
      NitroRefreshView *view = weakSelf;
      if (view) [NRRefreshRegistry emitState:view->_controllerId state:state];
    };
    _header.moved = ^(CGFloat offset, CGFloat height, BOOL isDragging) {
      NitroRefreshView *view = weakSelf;
      if (view && height > 0) [NRRefreshRegistry emitPull:view->_controllerId offset:offset height:height isDragging:isDragging];
    };
    _header.refreshingBlock = ^{
      NitroRefreshView *view = weakSelf;
      if (!view || !view->_header.isRefreshing || view->_header.ending) return;
      BOOL notify = view->_notifyNext;
      view->_notifyNext = YES;
      [NRRefreshRegistry refreshStarted:view->_controllerId notify:notify];
    };
    _header.endRefreshingCompletionBlock = ^{
      NitroRefreshView *view = weakSelf;
      if (!view) return;
      view->_active = NO;
      view->_header.ending = NO;
      view->_header.hidden = !view->_enabled;
      [view setScrollLocked:NO];
      [NRRefreshRegistry emitPull:view->_controllerId offset:0 height:view->_headerHeight isDragging:NO];
      [NRRefreshRegistry emitState:view->_controllerId state:@"idle"];
    };
    next.mj_header = _header;
    next.alwaysBounceVertical = YES;
  }
  [NRRefreshRegistry bindController:_controllerId target:self];
}

- (void)setScrollLocked:(BOOL)locked {
  if (!locked) {
    _scrollLockPan.delegate = nil;
    [_scrollLockPan.view removeGestureRecognizer:_scrollLockPan];
    _scrollLockPan = nil;
    return;
  }
  if (_scrollLockPan || !_scrollView) return;
  // Block vertical pans without replacing RN's delegate or scrollEnabled prop.
  _scrollLockPan = [[UIPanGestureRecognizer alloc] initWithTarget:nil action:nil];
  _scrollLockPan.delegate = self;
  _scrollLockPan.cancelsTouchesInView = YES;
  [_scrollView addGestureRecognizer:_scrollLockPan];
  if (_scrollView.isDecelerating) [_scrollView setContentOffset:_scrollView.contentOffset animated:NO];
  UIPanGestureRecognizer *pan = _scrollView.panGestureRecognizer;
  if (pan.enabled && (pan.state == UIGestureRecognizerStateBegan || pan.state == UIGestureRecognizerStateChanged)) {
    pan.enabled = NO;
    pan.enabled = YES; // Cancel the existing drag; subsequent drags use the guard.
  }
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer shouldBeRequiredToFailByGestureRecognizer:(UIGestureRecognizer *)other {
  // A dynamic dependency disappears with the guard when detached/unlocked.
  return gestureRecognizer == _scrollLockPan && other == _scrollView.panGestureRecognizer;
}

- (void)startRefreshWithNotify:(BOOL)notify {
  if (_active || !_header || _header.ending || (notify && !_enabled)) return;
  if (notify) [_scrollView setContentOffset:CGPointMake(_scrollView.contentOffset.x, -_scrollView.adjustedContentInset.top) animated:NO];
  _notifyNext = notify;
  _header.hidden = NO;
  _originalInsetTop = _scrollView.contentInset.top;
  _active = YES;
  [self setScrollLocked:YES];
  [_header beginRefreshing];
}

- (void)finishRefresh {
  if (!_active || _header.ending) return;
  _header.ending = YES;
  [NRRefreshRegistry emitState:_controllerId state:@"finishing"];
  [_header endRefreshing];
}

- (void)detachScrollView {
  [NRRefreshRegistry unbindController:_controllerId target:self];
  [self setScrollLocked:NO];
  if (!_header) return;
  _header.refreshingBlock = nil;
  _header.stateChanged = nil;
  _header.moved = nil;
  _header.willRefresh = nil;
  _header.endRefreshingCompletionBlock = nil;
  // Stop the library's pending transition before detaching its KVO observers.
  [_header.layer removeAllAnimations];
  if (_active) {
    _header.slowAnimationDuration = 0;
    _header.state = MJRefreshStateIdle;
    UIEdgeInsets inset = _scrollView.contentInset;
    inset.top = _originalInsetTop;
    _scrollView.contentInset = inset;
  }
  [_headerSlot removeFromSuperview];
  if (_scrollView.mj_header == _header) _scrollView.mj_header = nil;
  _scrollView.alwaysBounceVertical = _originalBounce;
  _scrollView = nil;
  _header = nil;
  _active = NO;
  _notifyNext = YES;
}

- (void)prepareForRecycle {
  [self detachScrollView];
  _controllerId = @"";
  _headerSlot = nil;
  [super prepareForRecycle];
}
- (void)dealloc { [self detachScrollView]; }
@end
