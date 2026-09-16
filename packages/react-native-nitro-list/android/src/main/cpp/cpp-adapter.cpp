#include <fbjni/fbjni.h>
#include "NitroListOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] {
    margelo::nitro::nitrolist::registerAllNatives();
  });
}
