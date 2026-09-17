#include <fbjni/fbjni.h>
#include "NitroViewabilityOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] {
    margelo::nitro::viewability::registerAllNatives();
  });
}
