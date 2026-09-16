#pragma once

#include <jsi/jsi.h>
#include <react/renderer/components/NitroListSpec/EventEmitters.h>
#include <react/renderer/components/NitroListSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

#include "NitroListSlotViewState.h"

namespace facebook::react {

JSI_EXPORT extern const char NitroListSlotViewComponentName[];

class JSI_EXPORT NitroListSlotViewShadowNode final
    : public ConcreteViewShadowNode<
          NitroListSlotViewComponentName,
          NitroListSlotViewProps,
          NitroListSlotViewEventEmitter,
          NitroListSlotViewState> {
 public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  Point getContentOriginOffset(bool includeTransform) const override;
};

} // namespace facebook::react
