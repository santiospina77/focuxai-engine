// @ts-nocheck
"use client";
import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const font = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

export default function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push("/ops");
  }, [session, router]);

  if (status === "loading") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#0B0E1A", fontFamily: font }}>
        <div style={{ width: 40, height: 40, border: "3px solid #2A2F4A", borderTopColor: "#0D7AB5", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center", height: "100vh",
      background: "linear-gradient(135deg, #0B0E1A 0%, #12162B 50%, #0B0E1A 100%)",
      fontFamily: font,
    }}>
      <div style={{
        background: "#12162B", borderRadius: 16, border: "1px solid #2A2F4A",
        padding: "48px 40px", maxWidth: 420, width: "100%", textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #0D7AB5, #2099D8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            FocuxAI Engine
          </div>
          <p style={{ color: "#8B92A8", fontSize: 13, margin: "8px 0 0", letterSpacing: "0.05em" }}>
            DETERMINISTIC · AUDITABLE · UNSTOPPABLE
          </p>
        </div>
        <button
          onClick={() => signIn("google", { callbackUrl: "/home" })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            width: "100%", padding: "14px 24px", borderRadius: 10,
            border: "1.5px solid #2A2F4A", background: "#1A1F38",
            color: "#E8ECF4", fontSize: 14, fontWeight: 600, cursor: "pointer",
            fontFamily: font, transition: "all 0.2s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Iniciar sesion con Google
        </button>
        <p style={{ color: "#5A6078", fontSize: 11, margin: "20px 0 0", lineHeight: 1.5 }}>
          Solo cuentas autorizadas de Focux Digital Group
        </p>
      </div>
    </div>
  );
}
