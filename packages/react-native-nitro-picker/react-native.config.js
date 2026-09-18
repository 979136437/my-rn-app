module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.nitropicker.NitroPickerPackage;',
        packageInstance: 'new NitroPickerPackage()',
      },
    },
  },
};
