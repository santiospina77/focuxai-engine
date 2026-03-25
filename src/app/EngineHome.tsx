// @ts-nocheck
"use client";

import { useRouter } from "next/navigation";

const APPS = [
  {
    id: "ops",
    name: "Focux Ops",
    desc: "Wizard multi-cliente para capturar todas las variables de una constructora y generar el Config JSON de implementación.",
    path: "/ops",
    icon: "⚙️",
    status: "live",
    badge: "Multi-Client",
  },
  {
    id: "adapter",
    name: "HubSpot Adapter",
    desc: "Toma el Config JSON + Private App Token y despliega propiedades, pipeline y workflows en el portal HubSpot por API.",
    path: "/adapter",
    icon: "🔌",
    status: "live",
    badge: "API v4",
  },
  {
    id: "scan",
    name: "Portal Scanner",
    desc: "Escanea un portal HubSpot existente y genera un reporte de estado: propiedades, workflows, pipelines, usuarios.",
    path: "/scan",
    icon: "🔍",
    status: "live",
    badge: null,
  },
  {
    id: "spot",
    name: "FocuxSpot",
    desc: "Diagnóstico de madurez digital. 120 puntos de evaluación, 5 módulos, 6 niveles. El punto de entrada comercial.",
    path: "/spot",
    icon: "📊",
    status: "soon",
    badge: "120 pts",
  },
];

export default function EngineHome() {
  const router = useRouter();

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      background: "#FAFBFD",
      minHeight: "100vh",
      color: "#1A1D26",
    }}>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #211968 0%, #1A4BA8 40%, #0D7AB5 70%, #2099D8 100%)",
        padding: "52px 24px 64px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Subtle grid pattern overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.06,
          backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 28, border: "1px solid rgba(255,255,255,0.15)",
          }}>⚡</div>
          <h1 style={{
            margin: "0 0 6px", color: "#fff", fontSize: 28, fontWeight: 800,
            letterSpacing: "0.06em",
          }}>
            FOCUXAI ENGINE
          </h1>
          <p style={{
            margin: "0 0 4px", color: "rgba(255,255,255,0.5)", fontSize: 13,
            fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase",
          }}>
            Deterministic · Auditable · Unstoppable
          </p>
          <p style={{
            margin: "12px auto 0", color: "rgba(255,255,255,0.7)", fontSize: 14,
            maxWidth: 520, lineHeight: 1.6,
          }}>
            Sistema operativo comercial inteligente para constructoras.
            Plataforma que se monta sobre cualquier CRM y le inyecta la lógica de negocio del sector construcción.
          </p>
        </div>
      </div>

      {/* Apps Grid */}
      <div style={{
        maxWidth: 960, margin: "-36px auto 0", padding: "0 20px 60px",
        position: "relative", zIndex: 2,
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {APPS.map(app => {
            const isLive = app.status === "live";
            return (
              <div
                key={app.id}
                onClick={() => isLive && router.push(app.path)}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: "1.5px solid #E8ECF1",
                  padding: "24px 22px 20px",
                  cursor: isLive ? "pointer" : "default",
                  transition: "all 0.25s ease",
                  position: "relative",
                  opacity: isLive ? 1 : 0.65,
                }}
                onMouseOver={e => {
                  if (!isLive) return;
                  e.currentTarget.style.borderColor = "#0D7AB5";
                  e.currentTarget.style.boxShadow = "0 8px 30px rgba(13,122,181,0.12)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = "#E8ECF1";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Top row: icon + status */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: isLive ? "linear-gradient(135deg, #0D7AB5, #1A4BA8)" : "#E8ECF1",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22,
                  }}>
                    {app.icon}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {app.badge && (
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                        background: isLive ? "#0D7AB518" : "#E8ECF1",
                        color: isLive ? "#0D7AB5" : "#9CA3AF",
                        letterSpacing: "0.02em",
                      }}>{app.badge}</span>
                    )}
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: isLive ? "#10B981" : "#F59E0B",
                      display: "inline-block",
                    }} />
                  </div>
                </div>

                {/* Name */}
                <h3 style={{
                  margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#211968",
                }}>{app.name}</h3>

                {/* Description */}
                <p style={{
                  margin: 0, fontSize: 12.5, color: "#6B7280", lineHeight: 1.55,
                }}>{app.desc}</p>

                {/* Footer */}
                <div style={{
                  marginTop: 16, paddingTop: 12, borderTop: "1px solid #F1F4F8",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  {isLive ? (
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: "#0D7AB5",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      Abrir <span style={{ fontSize: 14 }}>→</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#F59E0B" }}>
                      Próximamente
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, color: "#9CA3AF", fontWeight: 500,
                    fontFamily: "monospace",
                  }}>
                    /{app.id}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center", marginTop: 48, paddingTop: 24,
          borderTop: "1px solid #E8ECF1",
        }}>
          <p style={{
            margin: 0, fontSize: 11, color: "#9CA3AF", fontWeight: 500,
            letterSpacing: "0.03em",
          }}>
            FocuxAI Engine™ — Focux Digital Group S.A.S. · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
