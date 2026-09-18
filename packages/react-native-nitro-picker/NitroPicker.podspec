require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |spec|
  spec.name = 'NitroPicker'
  spec.version = package['version']
  spec.summary = package['description']
  spec.homepage = 'https://github.com/979136437/my-rn-app'
  spec.license = 'MIT'
  spec.authors = { 'NitroPicker' => 'https://github.com/979136437' }
  spec.source = { :git => 'https://github.com/979136437/my-rn-app.git', :tag => spec.version }
  spec.platform = :ios, '15.1'
  spec.swift_version = '5.9'
  spec.source_files = 'ios/**/*.{h,m,mm,swift}'
  spec.public_header_files = 'ios/NitroPickerScrollBridge.h'
  spec.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_ROOT)/Headers/Private/Yoga"'
  }
  spec.dependency 'React-RCTFabric'
  load 'nitrogen/generated/ios/NitroPicker+autolinking.rb'
  add_nitrogen_files(spec)
end
