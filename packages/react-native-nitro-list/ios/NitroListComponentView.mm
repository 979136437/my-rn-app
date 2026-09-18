#import "NitroListBridge.h"

#import <React/RCTViewComponentView.h>
#import <React/UIView+React.h>
#import <react/renderer/components/NitroListSpec/ComponentDescriptors.h>
#import <react/renderer/components/NitroListSpec/EventEmitters.h>
#import <react/renderer/components/NitroListSpec/Props.h>
#import <react/renderer/components/view/ConcreteViewShadowNode.h>
#import <react/renderer/core/ConcreteComponentDescriptor.h>
#ifdef RN_SERIALIZABLE_STATE
#include <folly/dynamic.h>
#endif

#include <cmath>
#include <memory>

namespace react = facebook::react;

// The slot is interfaceOnly in JS codegen because Android supplies its own
// descriptor. Register the same shadow behavior here without changing that API.
namespace facebook::react {
extern const char NitroListSlotViewComponentName[] = "NitroListSlotView";

class NitroListSlotViewState final {
 public:
  Point contentOffset{};
#ifdef RN_SERIALIZABLE_STATE
  NitroListSlotViewState() = default;
  NitroListSlotViewState(const NitroListSlotViewState &, folly::dynamic data)
      : contentOffset{static_cast<Float>(data["offsetLeft"].getDouble()),
                      static_cast<Float>(data["offsetTop"].getDouble())} {}
  folly::dynamic getDynamic() const {
    return folly::dynamic::object("offsetLeft", contentOffset.x)("offsetTop", contentOffset.y);
  }
#endif
};

class NitroListSlotViewShadowNode final
    : public ConcreteViewShadowNode<NitroListSlotViewComponentName,
                                    NitroListSlotViewProps,
                                    NitroListSlotViewEventEmitter,
                                    NitroListSlotViewState> {
 public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;
  Point getContentOriginOffset(bool includeTransform) const override {
    const auto offset = getStateData().contentOffset;
    const auto transform = includeTransform ? getTransform() : Transform::Identity();
    const auto result = transform * Vector{.x = offset.x, .y = offset.y, .z = 0.0f, .w = 1.0f};
    return {.x = result.x, .y = result.y};
  }
};

using NitroListSlotViewComponentDescriptor = ConcreteComponentDescriptor<NitroListSlotViewShadowNode>;
} // namespace facebook::react

static double ListNumber(NSDictionary *payload, NSString *key) {
  return [payload[key] respondsToSelector:@selector(doubleValue)] ? [payload[key] doubleValue] : 0;
}

static bool ListBool(NSDictionary *payload, NSString *key) {
  return [payload[key] respondsToSelector:@selector(boolValue)] && [payload[key] boolValue];
}

static std::string ListString(NSDictionary *payload, NSString *key) {
  NSString *value = [payload[key] isKindOfClass:NSString.class] ? payload[key] : @"";
  return value.UTF8String ?: "";
}

@class NitroListComponentView;

@interface NitroListSlotComponentView : RCTViewComponentView
@property (nonatomic, copy) NSString *listId;
@property (nonatomic, copy) NSString *slotId;
@property (nonatomic, copy) NSString *accessoryRole;
@property (nonatomic) double bindingToken;
@property (nonatomic) double itemVersion;
@property (nonatomic, weak, nullable) id<NitroListNativeView> mountedList;
@property (nonatomic, weak, nullable) NitroListComponentView *logicalParent;
- (void)mountIntoList:(id<NitroListNativeView>)list;
- (void)unmountFromList;
@end

@interface NitroListComponentView : RCTViewComponentView <NitroListSurfaceDelegate>
@end

@implementation NitroListSlotComponentView
{
  std::shared_ptr<const react::NitroListSlotViewShadowNode::ConcreteState> _slotState;
}

- (UIView *)reactSuperview { return _logicalParent ?: [super reactSuperview]; }

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _listId = @"";
    _slotId = @"";
    _accessoryRole = @"";
  }
  return self;
}

- (void)mountIntoList:(id<NitroListNativeView>)list {
  if (_mountedList == list) {
    [self syncMount];
    return;
  }
  [self unmountFromList];
  _mountedList = list;
  [self syncMount];
}

- (void)syncMount {
  if (_mountedList && _slotId.length) {
    [_mountedList mountSlot:self
                     slotId:_slotId
              accessoryRole:_accessoryRole
                     token:_bindingToken
                   version:_itemVersion];
    [self reportSize];
    [self updateContentOffset];
  }
}

- (void)unmountFromList {
  if (_mountedList && _slotId.length) {
    [_mountedList unmountSlot:self slotId:_slotId];
  }
  _mountedList = nil;
}

- (void)reportSize {
  if (_mountedList && _slotId.length) {
    [_mountedList reportMeasurement:_slotId
                             token:_bindingToken
                           version:_itemVersion
                             width:_layoutMetrics.frame.size.width
                            height:_layoutMetrics.frame.size.height];
  }
}

- (void)updateContentOffset {
  if (!_slotState || !_logicalParent || !self.superview) return;
  CGPoint origin = [self convertPoint:CGPointZero toView:_logicalParent];
  _slotState->updateState([origin](const react::NitroListSlotViewState &oldData)
      -> react::NitroListSlotViewShadowNode::ConcreteState::SharedData {
    if (std::abs(oldData.contentOffset.x - origin.x) < 0.5 &&
        std::abs(oldData.contentOffset.y - origin.y) < 0.5) return nullptr;
    auto next = oldData;
    next.contentOffset = {.x = (react::Float)origin.x, .y = (react::Float)origin.y};
    return std::make_shared<const react::NitroListSlotViewState>(next);
  });
}

- (void)layoutSubviews {
  [super layoutSubviews];
  [self updateContentOffset];
}

- (void)updateProps:(const react::Props::Shared &)props oldProps:(const react::Props::Shared &)oldProps {
  const auto &next = *std::static_pointer_cast<const react::NitroListSlotViewProps>(props);
  NSString *nextListId = [NSString stringWithUTF8String:next.listId.c_str()] ?: @"";
  NSString *nextSlotId = [NSString stringWithUTF8String:next.slotId.c_str()] ?: @"";
  NSString *nextRole = [NSString stringWithUTF8String:next.accessoryRole.c_str()] ?: @"";
  BOOL identityChanged = ![_listId isEqualToString:nextListId] || ![_slotId isEqualToString:nextSlotId];
  if (identityChanged) [self unmountFromList];
  _listId = nextListId;
  _slotId = nextSlotId;
  _accessoryRole = nextRole;
  _bindingToken = next.bindingToken;
  _itemVersion = next.itemVersion;
  [super updateProps:props oldProps:oldProps];
  [self syncMount];
}

- (void)updateLayoutMetrics:(const react::LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const react::LayoutMetrics &)oldLayoutMetrics {
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self reportSize];
  [self updateContentOffset];
}

- (void)updateState:(const react::State::Shared &)state oldState:(const react::State::Shared &)oldState {
  _slotState = std::static_pointer_cast<const react::NitroListSlotViewShadowNode::ConcreteState>(state);
  [self updateContentOffset];
}

- (void)prepareForRecycle {
  [self unmountFromList];
  _listId = @"";
  _slotId = @"";
  _accessoryRole = @"";
  _bindingToken = 0;
  _itemVersion = 0;
  _slotState.reset();
  [super prepareForRecycle];
}

+ (react::ComponentDescriptorProvider)componentDescriptorProvider {
  return react::concreteComponentDescriptorProvider<react::NitroListSlotViewComponentDescriptor>();
}

@end

@implementation NitroListComponentView {
  UIView<NitroListNativeView> *_surface;
  NSString *_listId;
  NSMutableArray<UIView<RCTComponentViewProtocol> *> *_logicalChildren;
}

- (NSArray<UIView *> *)reactSubviews { return _logicalChildren; }

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _listId = @"";
    _logicalChildren = [NSMutableArray new];
    Class surfaceClass = NSClassFromString(@"NitroListSurface");
    NSAssert(surfaceClass != Nil, @"NitroListSurface is missing from the iOS pod");
    _surface = [[surfaceClass alloc] initWithFrame:self.bounds];
    _surface.eventDelegate = self;
    self.contentView = _surface;
  }
  return self;
}

- (void)updateProps:(const react::Props::Shared &)props oldProps:(const react::Props::Shared &)oldProps {
  const auto &next = *std::static_pointer_cast<const react::NitroListViewProps>(props);
  NSString *nextId = [NSString stringWithUTF8String:next.listId.c_str()] ?: @"";
  if (![_listId isEqualToString:nextId]) {
    [NitroListBridge unregisterList:_surface listId:_listId];
    _listId = nextId;
    [NitroListBridge registerList:_surface listId:_listId];
  }
  [super updateProps:props oldProps:oldProps];
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index {
  NSUInteger insertionIndex = MIN(MAX(index, 0), (NSInteger)_logicalChildren.count);
  [_logicalChildren insertObject:childComponentView atIndex:insertionIndex];
  if ([childComponentView isKindOfClass:NitroListSlotComponentView.class]) {
    NitroListSlotComponentView *slot = (NitroListSlotComponentView *)childComponentView;
    slot.logicalParent = self;
    [slot mountIntoList:_surface];
  }
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index {
  if ([childComponentView isKindOfClass:NitroListSlotComponentView.class]) {
    NitroListSlotComponentView *slot = (NitroListSlotComponentView *)childComponentView;
    [slot unmountFromList];
    slot.logicalParent = nil;
  }
  [_logicalChildren removeObject:childComponentView];
  [childComponentView removeFromSuperview];
}

- (void)prepareForRecycle {
  for (UIView<RCTComponentViewProtocol> *child in _logicalChildren) {
    if ([child isKindOfClass:NitroListSlotComponentView.class]) {
      NitroListSlotComponentView *slot = (NitroListSlotComponentView *)child;
      [slot unmountFromList];
      slot.logicalParent = nil;
    }
  }
  [_logicalChildren removeAllObjects];
  [NitroListBridge unregisterList:_surface listId:_listId];
  _listId = @"";
  _surface.eventDelegate = nil;
  [super prepareForRecycle];
  _surface.eventDelegate = self;
}

- (void)emitListEvent:(NSString *)name payload:(NSDictionary<NSString *, id> *)payload {
  auto emitter = std::static_pointer_cast<const react::NitroListViewEventEmitter>(_eventEmitter);
  if (!emitter) return;
  if ([name isEqualToString:@"onScrollMetrics"]) {
    emitter->onScrollMetrics({ListNumber(payload, @"offsetY"), ListNumber(payload, @"pullDistance"),
      ListNumber(payload, @"viewportHeight"), ListNumber(payload, @"contentHeight"),
      ListNumber(payload, @"maxOffsetY"), ListString(payload, @"scrollState"),
      ListBool(payload, @"isAtStart"), ListBool(payload, @"isAtEnd"),
      ListNumber(payload, @"headerBottom"), ListNumber(payload, @"stickyTop"),
      ListBool(payload, @"isOffsetEstimated"), ListBool(payload, @"isContentSizeEstimated"),
      ListNumber(payload, @"timestamp")});
  } else if ([name isEqualToString:@"onStickyHeaderChange"]) {
    emitter->onStickyHeaderChange({ListString(payload, @"group"), ListNumber(payload, @"level"),
      ListString(payload, @"previousKey"), ListString(payload, @"key")});
  } else if ([name isEqualToString:@"onScrollToItemFailed"]) {
    emitter->onScrollToItemFailed({ListString(payload, @"key"), ListString(payload, @"reason")});
  } else if ([name isEqualToString:@"onListScroll"] || [name isEqualToString:@"onListScrollStateChange"]) {
    if ([name isEqualToString:@"onListScroll"]) {
      emitter->onListScroll({ListNumber(payload, @"offsetY"), ListNumber(payload, @"viewportWidth"),
        ListNumber(payload, @"viewportHeight"), ListNumber(payload, @"contentHeight"),
        ListString(payload, @"state"), ListString(payload, @"previousState"),
        ListNumber(payload, @"timestamp")});
    } else {
      emitter->onListScrollStateChange({ListNumber(payload, @"offsetY"), ListNumber(payload, @"viewportWidth"),
        ListNumber(payload, @"viewportHeight"), ListNumber(payload, @"contentHeight"),
        ListString(payload, @"state"), ListString(payload, @"previousState"),
        ListNumber(payload, @"timestamp")});
    }
  } else if ([name isEqualToString:@"onViewableItemsChange"]) {
    react::NitroListViewEventEmitter::OnViewableItemsChange event;
    event.epoch = ListNumber(payload, @"epoch");
    for (NSDictionary *item in payload[@"items"] ?: @[]) {
      event.items.push_back({ListString(item, @"key"), ListNumber(item, @"version")});
    }
    emitter->onViewableItemsChange(event);
  } else if ([name isEqualToString:@"onEndReached"]) {
    emitter->onEndReached({(int)ListNumber(payload, @"dataCount"), ListString(payload, @"tailKey"),
      ListNumber(payload, @"epoch"), ListNumber(payload, @"requestId")});
  } else if ([name isEqualToString:@"onRefreshRequested"]) {
    emitter->onRefreshRequested({(int)ListNumber(payload, @"sequence")});
  } else if ([name isEqualToString:@"onRefreshStateChange"]) {
    emitter->onRefreshStateChange({ListString(payload, @"state")});
  } else if ([name isEqualToString:@"onPullProgress"]) {
    emitter->onPullProgress({ListNumber(payload, @"distance"), ListNumber(payload, @"progress")});
  }
}

+ (react::ComponentDescriptorProvider)componentDescriptorProvider {
  return react::concreteComponentDescriptorProvider<react::NitroListViewComponentDescriptor>();
}

@end
