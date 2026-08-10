import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nineall HR — พนักงาน",
    short_name: "Nineall HR",
    description: "แอปพนักงาน บริษัท ไนน์ ออล กรุ๊ป จำกัด — ลงเวลา ลางาน สลิปเงินเดือน",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f7f8",
    theme_color: "#003942",
    orientation: "portrait",
    lang: "th",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
