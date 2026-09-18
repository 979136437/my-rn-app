module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.nitrolist.NitroListPackage;',
        packageInstance: 'new NitroListPackage()',
        libraryName: 'NitroListSpec',
        cmakeListsPath: './src/main/jni/CMakeLists.txt',
        componentDescriptors: [
          'NitroListViewComponentDescriptor',
          'NitroListSlotViewComponentDescriptor',
        ],
      },
    },
  },
};
