// Generate bindings only: no Gradle, CocoaPods, or native compilation.
/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const {
  combineSchemas,
} = require("@react-native/codegen/lib/cli/combine/combine-js-to-schema");
const codegen = require("@react-native/codegen/lib/generators/RNCodegen");

const root = path.resolve(__dirname, "..");
const schema = combineSchemas([
  path.join(root, "src/specs/NativeNitroPickerColumn.ts"),
]);
const platformGenerators = {
  android: "componentsAndroid",
  ios: "componentsIOS",
};
for (const [platform, generator] of Object.entries(platformGenerators)) {
  const outputDirectory = path.join(root, "generated", platform);
  fs.mkdirSync(outputDirectory, { recursive: true });
  codegen.generate(
    {
      libraryName: "NitroPickerSpec",
      schema,
      outputDirectory,
      packageName: "com.margelo.nitro.picker",
      assumeNonnull: true,
    },
    {
      generators: [generator],
    },
  );
}
