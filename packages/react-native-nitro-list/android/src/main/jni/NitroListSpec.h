#pragma once

#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

#include "NitroListSlotViewComponentDescriptor.h"

namespace facebook::react {

// The generated NitroListSpec-generated.cpp remains the only implementation.
// This facade only exposes its declaration and our interface-only component.
JSI_EXPORT std::shared_ptr<TurboModule> NitroListSpec_ModuleProvider(
    const std::string& moduleName,
    const JavaTurboModule::InitParams& params);

} // namespace facebook::react
