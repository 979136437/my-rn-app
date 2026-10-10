#import "NitroPickerColumn.h"
#import "NitroPicker-Swift-Cxx-Umbrella.hpp"
#import <react/renderer/components/NitroPickerSpec/ComponentDescriptors.h>
#import <react/renderer/components/NitroPickerSpec/EventEmitters.h>
#import <react/renderer/components/NitroPickerSpec/Props.h>

using namespace facebook::react;

static const CGFloat NPDefaultItemHeight = 44;
static const CGFloat NPSnapTolerance = 0.5;

@interface NitroPickerColumn () <UIScrollViewDelegate, NPPickerTarget>
@end

@implementation NitroPickerColumn {
  UIScrollView *_scroll;
  NSMutableArray<UIView<RCTComponentViewProtocol> *> *_items;
  NSString *_controllerId;
  CGFloat _itemHeight;
  NSInteger _requestedIndex;
  double _revision;
  BOOL _enabled;
  BOOL _picking;
  BOOL _pendingSelection;
  BOOL _layingOut;
  CGSize _previousSize;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<NitroPickerColumnComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _props = std::make_shared<const NitroPickerColumnProps>();
    _items = [NSMutableArray new];
    _controllerId = @"";
    _itemHeight = NPDefaultItemHeight;
    _enabled = YES;
    _pendingSelection = YES;
    _scroll = [UIScrollView new];
    _scroll.delegate = self;
    _scroll.bounces = NO;
    _scroll.showsVerticalScrollIndicator = NO;
    _scroll.showsHorizontalScrollIndicator = NO;
    _scroll.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    _scroll.decelerationRate = UIScrollViewDecelerationRateFast;
    _scroll.clipsToBounds = NO;
    _scroll.isAccessibilityElement = NO;
    self.contentView = _scroll;
  }
  return self;
}

- (NSInteger)clampIndex:(NSInteger)index {
  return _items.count == 0 ? -1 : MAX(0, MIN(index, (NSInteger)_items.count - 1));
}
- (NSInteger)selectedIndex {
  return [self clampIndex:lround(_scroll.contentOffset.y / _itemHeight)];
}
- (CGFloat)maximumOffset { return MAX(0, ((NSInteger)_items.count - 1) * _itemHeight); }

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &next = *std::static_pointer_cast<const NitroPickerColumnProps>(props);
  if (_itemHeight != next.itemHeight || _enabled != next.enabled) {
    [self cancelPicking:YES];
    _itemHeight = next.itemHeight;
    _enabled = next.enabled;
    _scroll.scrollEnabled = _enabled;
    _pendingSelection = YES;
    [self setNeedsLayout];
  }
  NSString *identifier = [NSString stringWithUTF8String:next.controllerId.c_str()];
  if (![_controllerId isEqualToString:identifier]) {
    [self cancelPicking:YES];
    [NPPickerRegistry unbindController:_controllerId target:self];
    _controllerId = identifier;
    [NPPickerRegistry bindController:_controllerId target:self];
  }
  [super updateProps:props oldProps:oldProps];
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)child index:(NSInteger)index {
  [self cancelPicking:YES];
  [_items insertObject:child atIndex:index];
  [_scroll addSubview:child];
  _pendingSelection = YES;
  [self setNeedsLayout];
}
- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)child index:(NSInteger)index {
  [self cancelPicking:YES];
  [_items removeObjectAtIndex:index];
  [child removeFromSuperview];
  _pendingSelection = YES;
  [self setNeedsLayout];
}

- (void)layoutSubviews {
  [super layoutSubviews];
  if (_layingOut) return;
  _layingOut = YES;
  CGSize size = self.bounds.size;
  if (!CGSizeEqualToSize(size, _previousSize)) {
    [self cancelPicking:YES];
    _previousSize = size;
    _pendingSelection = YES;
  }
  _scroll.frame = self.bounds;
  // Keep the signed inset: a row taller than the viewport extends on both
  // sides of its center. The scroll range remains (count - 1) * itemHeight.
  CGFloat padding = (size.height - _itemHeight) / 2;
  [_items enumerateObjectsUsingBlock:^(UIView *item, NSUInteger index, BOOL *stop) {
    item.frame = CGRectMake(0, padding + index * self->_itemHeight, size.width, self->_itemHeight);
  }];
  _scroll.contentSize = CGSizeMake(size.width, MAX(size.height, padding * 2 + _items.count * _itemHeight));
  if (_pendingSelection) {
    _pendingSelection = NO;
    CGFloat offset = MAX(0, [self clampIndex:_requestedIndex]) * _itemHeight;
    [_scroll setContentOffset:CGPointMake(0, offset) animated:NO];
  }
  _layingOut = NO;
  [self emitScroll];
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask {
  [super finalizeUpdates:updateMask];
  // Fabric's child layout updates must finish before applying native padding
  // and content frames to the mounted row hosts.
  [self setNeedsLayout];
}

- (void)applySelection:(NSInteger)index revision:(double)revision {
  if (_picking && index == _requestedIndex && revision == _revision) return;
  [self cancelPicking:YES];
  _requestedIndex = index;
  _revision = revision;
  _pendingSelection = YES;
  [self setNeedsLayout];
}
- (void)cancelPicking:(BOOL)notify {
  BOOL wasPicking = _picking;
  _picking = NO;
  // Setting the current offset cancels UIScrollView's system deceleration.
  [_scroll setContentOffset:_scroll.contentOffset animated:NO];
  if (_scroll.isDragging) {
    _scroll.panGestureRecognizer.enabled = NO;
    _scroll.panGestureRecognizer.enabled = _enabled;
  }
  if (wasPicking && notify) {
    [NPPickerRegistry ended:_controllerId index:[self selectedIndex] revision:_revision cancelled:YES];
  }
}
- (void)finishPicking {
  if (!_picking) return;
  CGFloat offset = MAX(0, [self selectedIndex]) * _itemHeight;
  if (fabs(_scroll.contentOffset.y - offset) > NPSnapTolerance) {
    // Only system scroll animation is used. There is no custom display loop.
    [_scroll setContentOffset:CGPointMake(0, offset) animated:!UIAccessibilityIsReduceMotionEnabled()];
    if (!UIAccessibilityIsReduceMotionEnabled()) return;
  }
  _picking = NO;
  [self emitScroll];
  [NPPickerRegistry ended:_controllerId index:[self selectedIndex] revision:_revision cancelled:NO];
}
- (void)scrollViewWillBeginDragging:(UIScrollView *)scrollView {
  if (_picking) {
    _picking = NO;
    [NPPickerRegistry ended:_controllerId index:[self selectedIndex] revision:_revision cancelled:YES];
  }
  _picking = YES;
  [NPPickerRegistry started:_controllerId revision:_revision];
}
- (void)scrollViewWillEndDragging:(UIScrollView *)scrollView withVelocity:(CGPoint)velocity targetContentOffset:(inout CGPoint *)targetContentOffset {
  CGFloat index = round(targetContentOffset->y / _itemHeight);
  targetContentOffset->y = MIN([self maximumOffset], MAX(0, index * _itemHeight));
}
- (void)scrollViewDidEndDragging:(UIScrollView *)scrollView willDecelerate:(BOOL)decelerate {
  if (!decelerate) [self finishPicking];
}
- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView { [self finishPicking]; }
- (void)scrollViewDidEndScrollingAnimation:(UIScrollView *)scrollView { [self finishPicking]; }
- (void)scrollViewDidScroll:(UIScrollView *)scrollView { [self emitScroll]; }
- (void)emitScroll {
  if (!_eventEmitter || _layingOut) return;
  auto emitter = std::static_pointer_cast<const NitroPickerColumnEventEmitter>(_eventEmitter);
  emitter->onPickerScroll({.offset = _scroll.contentOffset.y, .height = self.bounds.size.height});
}

- (void)prepareForRecycle {
  [self cancelPicking:NO];
  [NPPickerRegistry unbindController:_controllerId target:self];
  _controllerId = @"";
  for (UIView *item in _items) [item removeFromSuperview];
  [_items removeAllObjects];
  _itemHeight = NPDefaultItemHeight;
  _enabled = YES;
  _scroll.scrollEnabled = YES;
  _requestedIndex = 0;
  _revision = 0;
  _previousSize = CGSizeZero;
  _pendingSelection = YES;
  [super prepareForRecycle];
}
- (void)dealloc {
  _scroll.delegate = nil;
  [NPPickerRegistry unbindController:_controllerId target:self];
}
@end
