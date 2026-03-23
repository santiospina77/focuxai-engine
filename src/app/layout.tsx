import AuthProvider from "./providers";

export const metadata = {
  title: "FocuxAI Engine™",
  description: "Deterministic. Auditable. Unstoppable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
