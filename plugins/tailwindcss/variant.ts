import plugin from "tailwindcss/plugin";

export function TailwindcssPluginVariant(names: string[]) {
  return plugin(({ addVariant }) => {
    names.forEach((name) =>
      addVariant(`group-${name}`, `:merge(.group).${name} &`),
    );
  });
}
