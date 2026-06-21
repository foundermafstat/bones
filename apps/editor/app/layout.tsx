import "./globals.css";

export const metadata = {
  title: "Bones Editor",
  description: "Empty Bones editor shell"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
