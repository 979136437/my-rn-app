#import "NitroRefreshView.h"
#import "NitroRefresh-Swift-Cxx-Umbrella.hpp"
#import <React/RCTScrollViewComponentView.h>
#import <react/renderer/components/NitroRefreshSpec/ComponentDescriptors.h>
#import <react/renderer/components/NitroRefreshSpec/Props.h>
#import <QuartzCore/QuartzCore.h>

using namespace facebook::react;

// Must match JS/Fabric defaults. Animation is confined to the native container.
static const CGFloat NRDefaultHeaderHeight = 60;
static const CFTimeInterval NRRefreshAnimationDuration = 0.3;
static const CGFloat NROffsetTolerance = 0.5;
static void *NRScrollObservation = &NRScrollObservation;

@interface NitroRefreshView (Animation)
- (void)refreshAnimationTick:(CADisplayLink *)link;
@end

// Run-loop display links must not keep an unmounted Fabric view alive.
@interface NRRefreshAnimationTarget : NSObject
@property (nonatomic, weak) NitroRefreshView *view;
- (void)tick:(CADisplayLink *)link;
@end
@implementation NRRefreshAnimationTarget
- (void)tick:(CADisplayLink *)link { [self.view refreshAnimationTick:link]; }
@end

@interface NitroRefreshView () <NRRefreshTarget, UIGestureRecognizerDelegate>
@end

@implementation NitroRefreshView {
  NSString *_controllerId;
  UIView<RCTComponentViewProtocol> *_headerSlot;
  __weak UIScrollView *_scrollView;
  UIView *_header;
  UIPanGestureRecognizer *_scrollLockPan;
  CADisplayLink *_displayLink;
  BOOL _enabled;
  BOOL _active;
  BOOL _finishing;
  BOOL _bindingScheduled;
  BOOL _observing;
  BOOL _writingInset;
  BOOL _writingOffset;
  BOOL _writingBounce;
  BOOL _ownsBounce;
  BOOL _animateOffset;
  BOOL _animatingToIdle;
  CGFloat _headerHeight;
  CGFloat _baseInsetTop;
  CGFloat _ownedInset;
  CGFloat _animationFromInset;
  CGFloat _animationToInset;
  CGFloat _animationFromOffset;
  CGFloat _animationBaseAdjustedTop;
  CFTimeInterval _animationStart;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<NitroRefreshViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _props = std::make_shared<const NitroRefreshViewProps>();
    _controllerId = @"";
    _enabled = YES;
    _headerHeight = NRDefaultHeaderHeight;
    self.hidden = YES;
    self.userInteractionEnabled = NO;
  }
  return self;
}

- (CGFloat)baseAdjustedTop { return _scrollView.adjustedContentInset.top - _ownedInset; }
- (CGFloat)pullOffset { return MAX(0, -_scrollView.contentOffset.y - [self baseAdjustedTop]); }

- (void)layoutHeader {
  _header.frame = CGRectMake(0, -[self baseAdjustedTop] - _headerHeight, _scrollView.bounds.size.width, _headerHeight);
  _headerSlot.frame = _header.bounds;
}

- (void)emitPull {
  if (!_scrollView) return;
  BOOL dragging = _scrollView.isDragging && !_active && !_finishing;
  [NRRefreshRegistry emitPull:_controllerId offset:[self pullOffset] height:_headerHeight isDragging:dragging];
}

- (void)writeOwnedInset:(CGFloat)value {
  _ownedInset = value;
  _writingInset = YES;
  UIEdgeInsets inset = _scrollView.contentInset;
  inset.top = _baseInsetTop + _ownedInset;
  _scrollView.contentInset = inset;
  _writingInset = NO;
  [self layoutHeader];
}

- (void)writeOffset:(CGFloat)y {
  _writingOffset = YES;
  [_scrollView setContentOffset:CGPointMake(_scrollView.contentOffset.x, y) animated:NO];
  _writingOffset = NO;
}

- (void)cancelAnimation {
  [_displayLink invalidate];
  _displayLink = nil;
}

- (void)completeAnimation {
  [self cancelAnimation];
  [self emitPull];
  if (!_animatingToIdle) return;
  _active = NO;
  _finishing = NO;
  _header.hidden = !_enabled;
  [self setScrollLocked:NO];
  [NRRefreshRegistry emitPull:_controllerId offset:0 height:_headerHeight isDragging:NO];
  // Clear native flags first: the controller may immediately reopen on true.
  [NRRefreshRegistry emitState:_controllerId state:@"idle"];
}

- (void)animateInset:(CGFloat)target toIdle:(BOOL)toIdle {
  [self cancelAnimation];
  _animatingToIdle = toIdle;
  _animationFromInset = _ownedInset;
  _animationToInset = target;
  _animationFromOffset = _scrollView.contentOffset.y;
  _animationBaseAdjustedTop = [self baseAdjustedTop];
  _animateOffset = _animationFromOffset <= -_animationBaseAdjustedTop + NROffsetTolerance;
  _animationStart = CACurrentMediaTime();
  if (UIAccessibilityIsReduceMotionEnabled()) {
    [self writeOwnedInset:target];
    if (_animateOffset) [self writeOffset:-[self baseAdjustedTop] - target];
    [self completeAnimation];
    return;
  }
  NRRefreshAnimationTarget *targetObject = [NRRefreshAnimationTarget new];
  targetObject.view = self;
  _displayLink = [CADisplayLink displayLinkWithTarget:targetObject selector:@selector(tick:)];
  [_displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
}

- (void)refreshAnimationTick:(CADisplayLink *)link {
  if (link != _displayLink || !_scrollView) return;
  CGFloat fraction = MIN(1, MAX(0, (link.timestamp - _animationStart) / NRRefreshAnimationDuration));
  if (UIAccessibilityIsReduceMotionEnabled()) fraction = 1;
  CGFloat eased = 1 - (1 - fraction) * (1 - fraction);
  CGFloat inset = _animationFromInset + (_animationToInset - _animationFromInset) * eased;
  [self writeOwnedInset:inset];
  if (_animateOffset) {
    CGFloat baseline = [self baseAdjustedTop];
    CGFloat destination = -baseline - _animationToInset;
    CGFloat origin = _animationFromOffset - (baseline - _animationBaseAdjustedTop);
    [self writeOffset:origin + (destination - origin) * eased];
  }
  [self emitPull];
  if (fraction >= 1) [self completeAnimation];
}

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
  if (context != NRScrollObservation) {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
    return;
  }
  if (object != _scrollView) return;
  if ([keyPath isEqualToString:@"contentInset"]) {
    if (_writingInset) return;
    // RN's external contentInset writes are a new baseline, not our increment.
    _baseInsetTop = _scrollView.contentInset.top;
    [self writeOwnedInset:_ownedInset];
  } else if ([keyPath isEqualToString:@"alwaysBounceVertical"]) {
    if (!_writingBounce) _ownsBounce = NO;
    return;
  } else if ([keyPath isEqualToString:@"contentOffset"] && _displayLink && !_writingOffset && !_writingInset) {
    // scrollTo remains authoritative even while the header animates.
    _animateOffset = NO;
  }
  [self layoutHeader];
  [self emitPull];
  if (_active || _finishing || !_enabled || !_scrollView.isDragging) return;
  CGFloat offset = [self pullOffset];
  [NRRefreshRegistry emitState:_controllerId state:offset >= _headerHeight ? @"ready" : (offset > 0 ? @"pulling" : @"idle")];
}

- (void)panChanged:(UIPanGestureRecognizer *)pan {
  if (_active || _finishing || !_scrollView) return;
  if (pan.state != UIGestureRecognizerStateEnded && pan.state != UIGestureRecognizerStateCancelled && pan.state != UIGestureRecognizerStateFailed) return;
  CGFloat offset = [self pullOffset];
  if (pan.state == UIGestureRecognizerStateEnded && _enabled && offset >= _headerHeight) {
    [self startRefreshWithNotify:YES fromGesture:YES];
  } else if (offset > 0) {
    _finishing = YES;
    [NRRefreshRegistry emitState:_controllerId state:@"finishing"];
    [self animateInset:0 toIdle:YES];
  } else {
    [NRRefreshRegistry emitState:_controllerId state:@"idle"];
    [self emitPull];
  }
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
  if (![_controllerId isEqualToString:identifier]) { [self detachScrollView]; _controllerId = identifier; }
  BOOL heightChanged = _headerHeight != next.headerHeight;
  _enabled = next.enabled;
  _headerHeight = next.headerHeight;
  _header.hidden = !_enabled && !_active && !_finishing;
  [self layoutHeader];
  if (_active && !_finishing && heightChanged) [self animateInset:_headerHeight toIdle:NO];
  if (!_enabled && !_active && !_finishing && [self pullOffset] > 0) {
    _finishing = YES;
    [NRRefreshRegistry emitState:_controllerId state:@"finishing"];
    [self animateInset:0 toIdle:YES];
  }
  [super updateProps:props oldProps:oldProps];
  self.hidden = YES;
  [self scheduleBinding];
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask { [super finalizeUpdates:updateMask]; [self scheduleBinding]; }
- (void)layoutSubviews { [super layoutSubviews]; [self layoutHeader]; [self scheduleBinding]; }
- (void)didMoveToSuperview { [super didMoveToSuperview]; if (self.superview) [self scheduleBinding]; else [self detachScrollView]; }
- (void)didMoveToWindow { [super didMoveToWindow]; if (self.window) [self scheduleBinding]; else [self detachScrollView]; }

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
    NSAssert(next.refreshControl == nil, @"A scroll view can have only one refresh control");
    _scrollView = next;
    _baseInsetTop = next.contentInset.top;
    _header = [UIView new];
    _header.userInteractionEnabled = NO;
    _header.hidden = !_enabled;
    [_header addSubview:_headerSlot];
    [next addSubview:_header];
    [self layoutHeader];
    for (NSString *key in @[@"contentOffset", @"contentInset", @"adjustedContentInset", @"bounds", @"alwaysBounceVertical"]) {
      [next addObserver:self forKeyPath:key options:NSKeyValueObservingOptionNew context:NRScrollObservation];
    }
    _observing = YES;
    _ownsBounce = !next.alwaysBounceVertical;
    if (_ownsBounce) {
      _writingBounce = YES;
      next.alwaysBounceVertical = YES;
      _writingBounce = NO;
    }
    [next.panGestureRecognizer addTarget:self action:@selector(panChanged:)];
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
  _scrollLockPan = [[UIPanGestureRecognizer alloc] initWithTarget:nil action:nil];
  _scrollLockPan.delegate = self;
  _scrollLockPan.cancelsTouchesInView = YES;
  [_scrollView addGestureRecognizer:_scrollLockPan];
  if (_scrollView.isDecelerating) [self writeOffset:_scrollView.contentOffset.y];
  UIPanGestureRecognizer *pan = _scrollView.panGestureRecognizer;
  if (pan.enabled && (pan.state == UIGestureRecognizerStateBegan || pan.state == UIGestureRecognizerStateChanged)) {
    pan.enabled = NO;
    pan.enabled = YES;
  }
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer shouldBeRequiredToFailByGestureRecognizer:(UIGestureRecognizer *)other {
  return gestureRecognizer == _scrollLockPan && other == _scrollView.panGestureRecognizer;
}

- (void)startRefreshWithNotify:(BOOL)notify { [self startRefreshWithNotify:notify fromGesture:NO]; }
- (void)startRefreshWithNotify:(BOOL)notify fromGesture:(BOOL)fromGesture {
  if (_active || _finishing || !_header || (notify && !_enabled)) return;
  if (notify && !fromGesture) [self writeOffset:-[self baseAdjustedTop]];
  _active = YES;
  _header.hidden = NO;
  [self setScrollLocked:YES];
  [NRRefreshRegistry refreshStarted:_controllerId notify:notify];
  if (_active && !_finishing) [self animateInset:_headerHeight toIdle:NO];
}

- (void)finishRefresh {
  if (!_active || _finishing) return;
  _finishing = YES;
  [NRRefreshRegistry emitState:_controllerId state:@"finishing"];
  [self animateInset:0 toIdle:YES];
}

- (void)detachScrollView {
  [NRRefreshRegistry unbindController:_controllerId target:self];
  [self cancelAnimation];
  [self setScrollLocked:NO];
  UIScrollView *scroll = _scrollView;
  [scroll.panGestureRecognizer removeTarget:self action:@selector(panChanged:)];
  if (_observing) {
    for (NSString *key in @[@"contentOffset", @"contentInset", @"adjustedContentInset", @"bounds", @"alwaysBounceVertical"]) {
      [scroll removeObserver:self forKeyPath:key context:NRScrollObservation];
    }
    _observing = NO;
  }
  if (_ownedInset != 0) {
    CGFloat offset = [self pullOffset];
    [self writeOwnedInset:0];
    if (offset > 0) [self writeOffset:-[self baseAdjustedTop]];
  }
  if (_ownsBounce) scroll.alwaysBounceVertical = NO;
  [_headerSlot removeFromSuperview];
  [_header removeFromSuperview];
  _header = nil;
  _scrollView = nil;
  _ownedInset = 0;
  _active = NO;
  _finishing = NO;
  _ownsBounce = NO;
}

- (void)prepareForRecycle {
  [self detachScrollView];
  _controllerId = @"";
  _headerSlot = nil;
  [super prepareForRecycle];
}
- (void)dealloc { [self detachScrollView]; }
@end
