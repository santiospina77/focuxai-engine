// @ts-nocheck
"use client";

import { useRouter } from "next/navigation";

const FOCUX_LOGO = "data:image/png;base64,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";

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
          <img src={FOCUX_LOGO} alt="Focux" style={{ height: 72, margin: "0 auto 16px", display: "block", filter: "brightness(0) invert(1)" }} />
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
