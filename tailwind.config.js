import { TailwindcssPluginCommon } from "./plugins/tailwindcss";

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./packages/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [
    TailwindcssPluginCommon({
      cssRules: {
        "flex-center": {
          handle: () => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }),
        },
        "pos-center": {
          handle: () => ({
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }),
        },
      },
    }),
  ],
};
