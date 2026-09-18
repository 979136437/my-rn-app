require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |spec|
  spec.name = 'NitroViewability'
  spec.version = package['version']
  spec.summary = package['description']
  spec.homepage = 'https://github.com/mrousavy/nitro'
  spec.license = { :type => 'MIT' }
  spec.authors = { 'NitroViewability' => 'NitroViewability' }
  spec.source = { :git => 'https://github.com/mrousavy/nitro.git', :tag => spec.version.to_s }
  spec.platforms = { :ios => '15.1' }
  spec.swift_version = '5.9'
  spec.source_files = 'ios/**/*.{swift,h,hpp,m,mm}'
  spec.public_header_files = 'ios/**/*.hpp'
  spec.dependency 'React-Core'

  load 'nitrogen/generated/ios/NitroViewability+autolinking.rb'
  add_nitrogen_files(spec)
end
