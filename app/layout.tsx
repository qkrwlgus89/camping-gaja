import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "캠핑가자 — 지금, 숲에 앉아요.",
  description: "지금 한국 시간의 인제 숲속 캠프. 혼자 쉬거나 친구 한 명과 모닥불 곁에 앉아보세요.",
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#eaece0" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
