cmake_minimum_required(VERSION 3.13)

set(NITRO_LIST_GENERATED_JNI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../build/generated/source/codegen/jni)
set(NITRO_LIST_GENERATED_COMPONENTS_DIR ${NITRO_LIST_GENERATED_JNI_DIR}/react/renderer/components/NitroListSpec)

file(GLOB NITRO_LIST_CODEGEN_SOURCES CONFIGURE_DEPENDS
  ${NITRO_LIST_GENERATED_JNI_DIR}/*.cpp
  ${NITRO_LIST_GENERATED_COMPONENTS_DIR}/*.cpp
)

add_library(react_codegen_NitroListSpec OBJECT
  ${NITRO_LIST_CODEGEN_SOURCES}
  NitroListSlotViewShadowNode.cpp
)

# Autolinking includes NitroListSpec.h. Prefer our facade so it sees the custom
# slot descriptor as well as the generated module-provider declaration.
target_include_directories(react_codegen_NitroListSpec PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${NITRO_LIST_GENERATED_JNI_DIR}
  ${NITRO_LIST_GENERATED_COMPONENTS_DIR}
)

target_link_libraries(react_codegen_NitroListSpec
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
)

target_compile_reactnative_options(react_codegen_NitroListSpec PRIVATE)
