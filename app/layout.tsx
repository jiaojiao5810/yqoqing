
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GH Org Invite Center",
  description: "Invite by GitHub username or email, see member counts and pending invites."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
