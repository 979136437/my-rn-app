import plugin from "tailwindcss/plugin";
import type { CSSRuleObject, PluginAPI } from "tailwindcss/types/config";

export function TailwindcssPluginCommon<
  T extends Record<
    string,
    {
      handle: (e: {
        value?: string;
        theme: PluginAPI["theme"];
      }) => CSSRuleObject;
      options?: Parameters<PluginAPI["matchUtilities"]>[1];
    }
  >,
>({ cssRules, components }: { cssRules?: T; components?: T }) {
  return plugin(
    ({
      matchUtilities,
      addUtilities,
      addComponents,
      matchComponents,
      theme,
    }) => {
      if (cssRules) {
        Object.entries(cssRules).forEach(([className, { handle, options }]) => {
          addUtilities({
            [`.${className}`]: handle({ theme }),
          });
          matchUtilities(
            {
              [className]: (value) => handle({ value: value as string, theme }),
            },
            options,
          );
        });
      }
      if (components) {
        Object.entries(components).forEach(
          ([className, { handle, options }]) => {
            addComponents({
              [`.${className}`]: handle({ theme }),
            });
            matchComponents(
              {
                [className]: (value) =>
                  handle({ value: value as string, theme }),
              },
              options,
            );
          },
        );
      }
    },
  );
}
