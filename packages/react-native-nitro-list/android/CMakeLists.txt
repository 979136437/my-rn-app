cmake_minimum_required(VERSION 3.22.1)
project(NitroList)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(NitroList SHARED src/main/cpp/cpp-adapter.cpp)
include(${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/NitroList+autolinking.cmake)
target_link_libraries(NitroList android log)
