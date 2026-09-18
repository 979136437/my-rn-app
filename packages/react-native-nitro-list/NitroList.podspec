require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'NitroList'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://github.com/mrousavy/nitro'
  s.license = 'MIT'
  s.author = 'NitroList contributors'
  s.source = { :git => 'https://github.com/mrousavy/nitro.git', :tag => 'v0.37.1' }
  s.platforms = { :ios => '15.1' }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.public_header_files = 'ios/NitroListBridge.h'
  s.requires_arc = true
  s.swift_version = '5.9'
  s.dependency 'React-Core'
  s.dependency 'React-Fabric'
  s.dependency 'React-RCTFabric'
  s.dependency 'NitroViewability'

  load 'nitrogen/generated/ios/NitroList+autolinking.rb'
  add_nitrogen_files(s)
end
