import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Echly - 明日を整える音声チェックイン",
    short_name: "Echly",
    description: "声と予定から、無理のない翌日プランを提案するワークアシスタント。",
    start_url: "/",
    display: "standalone",
    background_color: "#eef2f0",
    theme_color: "#f8faf9",
    orientation: "portrait-primary",
    lang: "ja",
    categories: ["productivity", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png?v=0.3.1",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=0.3.1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png?v=0.3.1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
