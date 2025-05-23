import { Inter } from "next/font/google";
import "./globals.css";



export const metadata = {
  title: "File Processing and Regenerative AI Locally",
  description: "File Processing and Regenerative AI Locally",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className="Inter antialiased"
      >
        {children}
      </body>
    </html>
  );
}
