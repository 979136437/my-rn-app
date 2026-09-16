#pragma once

#include <react/renderer/graphics/Point.h>

#ifdef RN_SERIALIZABLE_STATE
#include <folly/dynamic.h>
#endif

namespace facebook::react {

class NitroListSlotViewState final {
 public:
  Point contentOffset{};

  NitroListSlotViewState() = default;

#ifdef RN_SERIALIZABLE_STATE
  NitroListSlotViewState(
      const NitroListSlotViewState& /*previousState*/,
      folly::dynamic data)
      : contentOffset{
            static_cast<Float>(data["offsetLeft"].getDouble()),
            static_cast<Float>(data["offsetTop"].getDouble())} {}

  folly::dynamic getDynamic() const {
    return folly::dynamic::object("offsetLeft", contentOffset.x)(
        "offsetTop", contentOffset.y);
  }
#endif
};

} // namespace facebook::react
