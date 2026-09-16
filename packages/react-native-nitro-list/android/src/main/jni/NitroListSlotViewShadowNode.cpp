#include "NitroListSlotViewShadowNode.h"

namespace facebook::react {

const char NitroListSlotViewComponentName[] = "NitroListSlotView";

Point NitroListSlotViewShadowNode::getContentOriginOffset(
    bool includeTransform) const {
  // Yoga keeps each reusable slot at (0, 0); RecyclerView positions its physical
  // parent. Fabric measurements must include that native displacement so a
  // Pressable's retention rectangle agrees with the physical touch coordinates.
  const auto offset = getStateData().contentOffset;
  const auto transform = includeTransform ? getTransform() : Transform::Identity();
  const auto result = transform *
      Vector{.x = offset.x, .y = offset.y, .z = 0.0f, .w = 1.0f};
  return {.x = result.x, .y = result.y};
}

} // namespace facebook::react
