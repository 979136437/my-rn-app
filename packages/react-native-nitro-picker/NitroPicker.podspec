require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# Workspace-only pod, resolved by React Native autolinking with :path.
Pod::Spec.new do |s|
  s.name = 'NitroPicker'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://github.com/979136437/my-rn-app'
  s.source = { :git => 'https://github.com/979136437/my-rn-app.git' }
  s.license = package['license']
  s.authors = 'Workspace contributors'
  s.platforms = { :ios => min_ios_version_supported }
  s.swift_version = '5.0'
  s.source_files = 'ios/**/*.{h,mm,swift}'
  load File.join(__dir__, 'nitrogen/generated/ios/NitroPicker+autolinking.rb')
  add_nitrogen_files(s)
  install_modules_dependencies(s)
end
