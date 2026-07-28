import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Common Table",
    short_name: "Common Table",
    description: "A personal cookbook for finding recipes and planning meals.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ed",
    theme_color: "#315a45",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
