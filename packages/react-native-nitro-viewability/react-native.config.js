module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.viewability.NitroViewabilityPackage;',
        packageInstance: 'new NitroViewabilityPackage()',
      },
      ios: null,
    },
  },
};
