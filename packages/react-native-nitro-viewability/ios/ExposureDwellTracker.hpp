#pragma once

#include <algorithm>
#include <cmath>
#include <optional>

namespace nitro_viewability {

struct ExposureDwellResult {
  bool visible;
  std::optional<double> nextCheckDelaySeconds;
};

// One tracker per content identity. Call with monotonic seconds on one thread.
class ExposureDwellTracker {
 public:
  void reset() { visibleSince_.reset(); }

  ExposureDwellResult update(double percent, double threshold,
                             double minimumViewTimeMs, double nowSeconds) {
    if (!std::isfinite(percent) || percent <= 0 || percent < threshold) {
      reset();
      return {false, std::nullopt};
    }
    if (!visibleSince_ || nowSeconds < *visibleSince_) visibleSince_ = nowSeconds;
    const double remainingMs = std::ceil(minimumViewTimeMs) -
                               (nowSeconds - *visibleSince_) * 1000.0;
    if (remainingMs <= 0) return {true, std::nullopt};
    return {false, remainingMs / 1000.0};
  }

 private:
  std::optional<double> visibleSince_;
};

}  // namespace nitro_viewability
