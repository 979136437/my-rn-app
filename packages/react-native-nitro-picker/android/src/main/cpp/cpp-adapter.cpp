#include <fbjni/fbjni.h>
#include "NitroPickerOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] {
    margelo::nitro::picker::registerAllNatives();
  });
}
