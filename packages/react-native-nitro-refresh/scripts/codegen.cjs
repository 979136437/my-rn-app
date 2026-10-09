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
  path.join(root, "src/specs/NativeNitroRefreshView.ts"),
]);
for (const platform of ["android", "ios"]) {
  const outputDirectory = path.join(root, "generated", platform);
  fs.mkdirSync(outputDirectory, { recursive: true });
  codegen.generate(
    {
      libraryName: "NitroRefreshSpec",
      schema,
      outputDirectory,
      packageName: "com.margelo.nitro.refresh",
      assumeNonnull: true,
    },
    {
      generators: [
        platform === "android" ? "componentsAndroid" : "componentsIOS",
      ],
    },
  );
}
