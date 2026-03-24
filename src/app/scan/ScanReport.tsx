// @ts-nocheck
"use client";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Link,
  Image,
  pdf,
} from "@react-pdf/renderer";
import { saveAs } from "file-saver";

/* ═══════════════════════════════════════════════════════════
   FOCUX SCAN — PDF EXECUTIVE REPORT
   @react-pdf/renderer — Client-side generation
   The sales closer.
   FocuxAI Engine™ | Focux Digital Group S.A.S.
   ═══════════════════════════════════════════════════════════ */

/* ═══ FONTS ═══ */
Font.register({
  family: "Poppins",
  fonts: [
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-400-normal.woff", fontWeight: 400 },
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-500-normal.woff", fontWeight: 500 },
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-700-normal.woff", fontWeight: 700 },
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-300-normal.woff", fontWeight: 300 },
  ],
});

/* ═══ BRAND COLORS ═══ */
const C = {
  navy: "#1F0067",
  purple: "#6410F7",
  cyan: "#08C1F5",
  teal: "#76F6EA",
  blue: "#4491F6",
  grayBody: "#5A5A7A",
  grayLight: "#E8ECF4",
  grayBg: "#F4F5F9",
  red: "#EF4444",
  amber: "#F59E0B",
  green: "#10B981",
  dark: "#0B0E1A",
  white: "#FFFFFF",
  muted: "#8B92A8",
  border: "#2A2F4A",
};



/* ═══ LOGO BASE64 (embedded for @react-pdf/renderer) ═══ */
const LOGO_ICON = "data:image/png;base64,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";
const LOGO_FULL = "data:image/png;base64,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";

/* ═══ STYLES ═══ */
const s = StyleSheet.create({
  page: { fontFamily: "Poppins", fontSize: 10, color: C.grayBody, padding: 50 },
  // Cover
  coverPage: { fontFamily: "Poppins", backgroundColor: C.dark, padding: 0 },
  gradientBar: { height: 6, backgroundColor: C.purple, width: "100%" },
  coverContent: { padding: 50 },
  coverLogo: { flexDirection: "row", alignItems: "center", marginBottom: 160 },
  coverLogoText: { fontSize: 16, fontWeight: 300, color: C.white, letterSpacing: 6 },
  coverTitle: { fontSize: 38, fontWeight: 700, color: C.white, lineHeight: 1.15 },
  coverTitleAccent: { fontSize: 38, fontWeight: 700, color: C.cyan, lineHeight: 1.15 },
  coverDivider: { width: 200, height: 1, backgroundColor: C.border, marginTop: 20, marginBottom: 20 },
  coverClient: { fontSize: 16, fontWeight: 500, color: C.white, marginBottom: 6 },
  coverMeta: { fontSize: 11, color: C.muted, marginBottom: 4 },
  coverFooter: { position: "absolute", bottom: 50, left: 0, right: 0, textAlign: "center" },
  coverFooterText: { fontSize: 8, fontWeight: 300, color: "#5A6078", letterSpacing: 1 },
  // Page header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerLogo: { fontSize: 10, fontWeight: 300, color: C.navy, letterSpacing: 4 },
  headerClient: { fontSize: 8, color: "#CCCCCC" },
  // Titles
  pageTitle: { fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 6 },
  accentLine: { width: 80, height: 3, backgroundColor: C.purple, marginBottom: 16 },
  subtitle: { fontSize: 10, color: C.grayBody, marginBottom: 20 },
  // KPI
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  kpiCard: { width: "23.5%", backgroundColor: C.grayBg, borderRadius: 8, padding: "14 10", alignItems: "center" },
  kpiValue: { fontSize: 26, fontWeight: 700, marginBottom: 2 },
  kpiLabel: { fontSize: 8, fontWeight: 500, color: C.grayBody, marginBottom: 2 },
  kpiSub: { fontSize: 7, color: C.muted },
  // Bars
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  barLabel: { width: 72, fontSize: 9, fontWeight: 500, color: C.grayBody },
  barBg: { flex: 1, height: 12, backgroundColor: C.grayBg, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 12, borderRadius: 4 },
  barCount: { width: 30, fontSize: 9, fontWeight: 700, color: C.navy, textAlign: "right", marginLeft: 6 },
  // Heritage
  heritageSection: { marginBottom: 16 },
  heritageTitle: { fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 12 },
  heritageItem: { marginBottom: 14 },
  heritageName: { fontSize: 9, fontWeight: 500, color: C.navy, marginBottom: 3 },
  heritageOrgSub: { fontSize: 7, color: C.muted },
  heritageMeta: { fontSize: 6, color: C.muted, marginTop: 2 },
  heritageBarRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heritageBarBg: { flex: 1, height: 10, backgroundColor: C.grayBg, borderRadius: 4, overflow: "hidden" },
  heritageBarFill: { height: 10, borderRadius: 4 },
  heritageCount: { fontSize: 8, fontWeight: 700, color: C.navy, width: 60 },
  // Insight box
  insightBox: { backgroundColor: "#EDE9FE", borderRadius: 8, padding: 16, borderLeft: `3px solid ${C.purple}`, marginTop: 12 },
  insightTitle: { fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 4 },
  insightText: { fontSize: 9, color: C.grayBody },
  // Issues
  issueCard: { borderRadius: 8, padding: "12 14", marginBottom: 10 },
  issueHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  issueBadge: { fontSize: 7, fontWeight: 700 },
  issueNumber: { fontSize: 7, fontWeight: 700, color: C.muted },
  issueTitle: { fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 4 },
  issueDetail: { fontSize: 8, color: C.grayBody, lineHeight: 1.4 },
  // Recommendations
  recItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 18, gap: 12 },
  recCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.purple, alignItems: "center", justifyContent: "center" },
  recNum: { fontSize: 12, fontWeight: 700, color: C.white },
  recText: { flex: 1, fontSize: 10, color: C.navy, lineHeight: 1.5 },
  // CTA
  ctaBox: { backgroundColor: C.navy, borderRadius: 12, padding: 28, alignItems: "center", marginTop: 24 },
  ctaTitle: { fontSize: 18, fontWeight: 700, color: C.white, marginBottom: 8 },
  ctaSub: { fontSize: 10, color: C.muted, textAlign: "center", marginBottom: 6 },
  ctaContact: { fontSize: 10, fontWeight: 700, color: C.cyan, marginBottom: 6 },
  ctaLink: { fontSize: 9, fontWeight: 500, color: C.teal, textDecoration: "none" },
  // Warning box
  warnBox: { backgroundColor: "#FFF8E1", borderRadius: 8, padding: 14, borderLeft: `3px solid ${C.amber}`, marginTop: 16 },
  warnTitle: { fontSize: 10, fontWeight: 700, color: "#92400E", marginBottom: 4 },
  warnText: { fontSize: 8, color: C.grayBody },
  // Footer
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, textAlign: "center" },
  footerText: { fontSize: 7, color: "#AAAAAA" },
});

/* ═══ SEVERITY CONFIG ═══ */
const SEV = {
  critical: { bg: "#FEE2E2", color: C.red, label: "CRÍTICO" },
  high: { bg: "#FFF8E1", color: C.amber, label: "ALTO" },
  medium: { bg: "#E3F2FD", color: C.blue, label: "MEDIO" },
};

/* ═══ HELPER: Build heritage from scan data ═══ */
function buildHeritage(properties, owners, users) {
  const ownerMap = {};
  (owners || []).forEach((o) => {
    if (o.userId) ownerMap[String(o.userId)] = o.email || `${o.firstName || ""} ${o.lastName || ""}`.trim();
  });
  (users || []).forEach((u) => {
    if (u.id) ownerMap[String(u.id)] = u.email || `${u.firstName || ""} ${u.lastName || ""}`.trim();
  });

  // By person
  const byPerson = {};
  (properties || []).forEach((p) => {
    const creator = ownerMap[String(p.createdUserId)] || p.createdUserId || "Desconocido";
    if (!byPerson[creator]) byPerson[creator] = { count: 0, earliest: null, latest: null };
    byPerson[creator].count++;
    if (p.createdAt) {
      if (!byPerson[creator].earliest || p.createdAt < byPerson[creator].earliest) byPerson[creator].earliest = p.createdAt;
      if (!byPerson[creator].latest || p.createdAt > byPerson[creator].latest) byPerson[creator].latest = p.createdAt;
    }
  });

  // By domain/org
  const byOrg = {};
  Object.entries(byPerson).forEach(([email, info]) => {
    const domain = email.includes("@") ? email.split("@")[1] : email;
    if (!byOrg[domain]) byOrg[domain] = { count: 0, earliest: null, latest: null, emails: [] };
    byOrg[domain].count += info.count;
    byOrg[domain].emails.push(email);
    if (info.earliest && (!byOrg[domain].earliest || info.earliest < byOrg[domain].earliest)) byOrg[domain].earliest = info.earliest;
    if (info.latest && (!byOrg[domain].latest || info.latest > byOrg[domain].latest)) byOrg[domain].latest = info.latest;
  });

  const total = properties?.length || 1;
  const fmtDate = (ts) => {
    if (!ts) return "";
    try { return new Date(ts).toLocaleDateString("es-CO", { year: "numeric", month: "short" }); } catch { return ""; }
  };
  const fmtPeriod = (e, l) => {
    const a = fmtDate(e);
    const b = fmtDate(l);
    return a === b ? a : `${a} — ${b}`;
  };

  const persons = Object.entries(byPerson)
    .map(([creator, info]) => ({ creator, count: info.count, pct: Math.round((info.count / total) * 100), period: fmtPeriod(info.earliest, info.latest) }))
    .sort((a, b) => b.count - a.count);

  const orgs = Object.entries(byOrg)
    .map(([domain, info]) => ({ domain, count: info.count, pct: Math.round((info.count / total) * 100), period: fmtPeriod(info.earliest, info.latest), emails: info.emails }))
    .sort((a, b) => b.count - a.count);

  return { persons, orgs };
}

/* ═══ HELPER: Build issues from KPIs ═══ */
function buildIssues(kpis, heritage, duplicates) {
  const issues = [];
  if (kpis.orphanedPropsPct >= 40) {
    issues.push({ severity: "critical", title: `${kpis.orphanedPropsPct}% de propiedades custom sin uso`, detail: `${kpis.orphanedProps} de ${kpis.totalProps} propiedades no están referenciadas en ningún workflow, formulario, lista o pipeline. Ensucian el CRM y confunden al equipo.` });
  } else if (kpis.orphanedProps > 5) {
    issues.push({ severity: "high", title: `${kpis.orphanedProps} propiedades custom sin uso`, detail: `Propiedades no referenciadas en ningún activo. Se recomienda limpiar o consolidar.` });
  }
  if (heritage.persons.length >= 4) {
    issues.push({ severity: "critical", title: `${heritage.persons.length} personas de ${heritage.orgs.length} organizaciones tocaron el portal`, detail: "Sin governance de naming ni documentación. Cada agencia dejó propiedades huérfanas que nadie limpió." });
  }
  if (kpis.trashWorkflows >= 2) {
    issues.push({ severity: "high", title: `${kpis.trashWorkflows} workflows basura en el sistema`, detail: "Workflows con nombres 'TEST', 'Copy of', 'backup' que nunca se limpiaron. Generan ruido." });
  }
  if (duplicates?.length > 0) {
    issues.push({ severity: "high", title: `${duplicates.length} propiedades duplicadas detectadas`, detail: duplicates.slice(0, 3).map(([a, b]) => `"${a}" ↔ "${b}"`).join(", ") + ". Data fragmentada entre campos paralelos." });
  }
  if (kpis.pipelinesNoReq > 0) {
    issues.push({ severity: "medium", title: `${kpis.pipelinesNoReq} pipeline(s) sin campos obligatorios`, detail: "Los deals avanzan sin datos mínimos, rompiendo reportería y forecast." });
  }
  if (kpis.inactiveUsers >= 2) {
    issues.push({ severity: "medium", title: `${kpis.inactiveUsers} usuarios inactivos con acceso al portal`, detail: "Sin login en 90+ días. Riesgo de seguridad y governance." });
  }
  return issues.slice(0, 6);
}

/* ═══ HELPER: Build recommendations from issues ═══ */
function buildRecommendations(kpis, heritage, duplicates) {
  const recs = [];
  if (kpis.orphanedProps > 0) recs.push(`Limpiar las ${kpis.orphanedProps} propiedades huérfanas${duplicates?.length ? ` y consolidar las ${duplicates.length} duplicadas en campos estándar` : ""}.`);
  if (kpis.trashWorkflows > 0) recs.push(`Eliminar los ${kpis.trashWorkflows} workflows basura y documentar los ${kpis.totalWorkflows - kpis.offWorkflows - kpis.trashWorkflows} activos con nomenclatura estandarizada.`);
  if (kpis.pipelinesNoReq > 0) recs.push("Agregar campos obligatorios a los pipelines sin requisitos para garantizar data quality en cada etapa.");
  if (kpis.inactiveUsers > 0) recs.push(`Desactivar los ${kpis.inactiveUsers} usuarios inactivos y revisar roles de Super Admins.`);
  recs.push("Establecer governance de naming: prefijos por módulo, grupos documentados, y ownership claro de cada activo.");
  return recs.slice(0, 5);
}

/* ═══════════════════════════════════════════════════════════
   PDF DOCUMENT COMPONENT
   ═══════════════════════════════════════════════════════════ */
function ScanReportDocument({ scanData, clientName, scanDate }) {
  const k = scanData.kpis;
  const heritage = buildHeritage(scanData.properties, scanData.owners, scanData.users);
  const issues = buildIssues(k, heritage, scanData.duplicates);
  const recommendations = buildRecommendations(k, heritage, scanData.duplicates);
  const dateStr = scanDate || new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });

  const Footer = ({ pageNum }) => (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>FocuxScan Report — {clientName} — {dateStr} — Página {pageNum}</Text>
    </View>
  );

  const Header = () => (
    <View style={s.header}>
      <View style={s.headerLeft}>
        {/* @ts-ignore */}
        <Image src={LOGO_ICON} style={{ width: 22, height: 17, marginRight: 6 }} />
        <Text style={s.headerLogo}>Focux</Text>
      </View>
      <Text style={s.headerClient}>{clientName}</Text>
    </View>
  );

  return (
    <Document title={`FocuxScan Report — ${clientName}`} author="Focux Digital Group S.A.S.">
      {/* ── PAGE 1: COVER ── */}
      <Page size="LETTER" style={s.coverPage}>
        <View style={s.gradientBar} />
        <View style={s.coverContent}>
          <View style={s.coverLogo}>
            {/* @ts-ignore */}
            <Image src={LOGO_ICON} style={{ width: 36, height: 28 }} />
            <Text style={s.coverLogoText}>Focux</Text>
          </View>
          <Text style={s.coverTitle}>Portal</Text>
          <Text style={s.coverTitle}>Inventory</Text>
          <Text style={s.coverTitleAccent}>Report</Text>
          <View style={s.coverDivider} />
          <Text style={s.coverClient}>{clientName}</Text>
          <Text style={s.coverMeta}>Escaneado: {dateStr}</Text>
        </View>
        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>FOCUX SCAN — FOCUXAI ENGINE™</Text>
        </View>
      </Page>

      {/* ── PAGE 2: EXECUTIVE SUMMARY ── */}
      <Page size="LETTER" style={s.page}>
        <Header />
        <Text style={s.pageTitle}>Executive Summary</Text>
        <View style={s.accentLine} />
        <Text style={s.subtitle}>Resultado del scan automático del portal HubSpot de {clientName}.</Text>

        {/* KPI Row 1 */}
        <View style={s.kpiGrid}>
          {[
            [k.totalProps, "Propiedades Custom", `${k.orphanedPropsPct}% huérfanas`, C.cyan],
            [k.orphanedProps, "Huérfanas", "Sin referencia", C.red],
            [k.totalWorkflows, "Workflows", `${k.offWorkflows} apagados`, C.blue],
            [k.trashWorkflows, "Basura", "test / copy / backup", C.amber],
            [k.totalPipelines, "Pipelines", `${k.pipelinesNoReq} sin req.`, C.purple],
            [k.totalForms, "Formularios", `${k.zeroSubmForms} sin subm.`, C.green],
            [k.totalLists, "Listas", `${k.orphanedLists} vacías`, C.blue],
            [k.totalUsers, "Usuarios", `${k.inactiveUsers} inactivos`, C.cyan],
          ].map(([val, label, sub, color], i) => (
            <View key={i} style={s.kpiCard}>
              <Text style={[s.kpiValue, { color }]}>{val}</Text>
              <Text style={s.kpiLabel}>{label}</Text>
              <Text style={s.kpiSub}>{sub}</Text>
            </View>
          ))}
        </View>

        {/* Props by object */}
        <Text style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 10, marginTop: 8 }}>Propiedades por Objeto</Text>
        {Object.entries(scanData.kpis.propsByObj || {}).map(([obj, count], i) => {
          const max = Math.max(...Object.values(scanData.kpis.propsByObj || {}), 1);
          return (
            <View key={i} style={s.barRow}>
              <Text style={s.barLabel}>{obj}</Text>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${(count / max) * 100}%`, backgroundColor: C.purple }]} />
              </View>
              <Text style={s.barCount}>{count}</Text>
            </View>
          );
        })}

        {/* Duplicates */}
        {scanData.duplicates?.length > 0 && (
          <View style={s.warnBox}>
            <Text style={s.warnTitle}>⚠ {scanData.duplicates.length} Posibles Duplicados Detectados</Text>
            <Text style={s.warnText}>
              {scanData.duplicates.slice(0, 3).map(([a, b]) => `"${a}" ↔ "${b}"`).join("  ·  ")}
            </Text>
          </View>
        )}

        <Footer pageNum={2} />
      </Page>

      {/* ── PAGE 3: HERITAGE ── */}
      <Page size="LETTER" style={s.page}>
        <Header />
        <Text style={s.pageTitle}>Herencia de Agencias</Text>
        <View style={s.accentLine} />
        <Text style={s.subtitle}>¿Quién creó qué en tu portal? Agrupado por persona y por organización.</Text>

        {/* By Person */}
        <View style={s.heritageSection}>
          <Text style={s.heritageTitle}>Por Persona</Text>
          {heritage.persons.slice(0, 6).map((p, i) => (
            <View key={i} style={s.heritageItem}>
              <Text style={s.heritageName}>{p.creator}</Text>
              <View style={s.heritageBarRow}>
                <View style={s.heritageBarBg}>
                  <View style={[s.heritageBarFill, { width: `${Math.max(p.pct, 3)}%`, backgroundColor: C.purple }]} />
                </View>
                <Text style={s.heritageCount}>{p.count} ({p.pct}%)</Text>
              </View>
              <Text style={s.heritageMeta}>{p.period}</Text>
            </View>
          ))}
        </View>

        {/* By Organization */}
        <View style={s.heritageSection}>
          <Text style={s.heritageTitle}>Por Organización</Text>
          {heritage.orgs.slice(0, 5).map((o, i) => (
            <View key={i} style={s.heritageItem}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={s.heritageName}>{o.domain}</Text>
                <Text style={s.heritageOrgSub}>({o.emails.length} persona{o.emails.length > 1 ? "s" : ""})</Text>
              </View>
              <View style={s.heritageBarRow}>
                <View style={s.heritageBarBg}>
                  <View style={[s.heritageBarFill, { width: `${Math.max(o.pct, 3)}%`, backgroundColor: C.cyan }]} />
                </View>
                <Text style={s.heritageCount}>{o.count} ({o.pct}%)</Text>
              </View>
              <Text style={s.heritageMeta}>{o.period}</Text>
            </View>
          ))}
        </View>

        {/* Insight */}
        <View style={s.insightBox}>
          <Text style={s.insightTitle}>{heritage.persons.length} personas de {heritage.orgs.length} organizaciones tocaron este portal</Text>
          <Text style={s.insightText}>Sin governance de naming, sin documentación, sin estándares.</Text>
        </View>

        <Footer pageNum={3} />
      </Page>

      {/* ── PAGE 4: ISSUES ── */}
      <Page size="LETTER" style={s.page}>
        <Header />
        <Text style={s.pageTitle}>Hallazgos Críticos</Text>
        <View style={s.accentLine} />
        <Text style={s.subtitle}>Los problemas más importantes detectados en el scan de tu portal.</Text>

        {issues.map((issue, i) => {
          const sev = SEV[issue.severity] || SEV.medium;
          return (
            <View key={i} style={[s.issueCard, { backgroundColor: sev.bg, borderLeft: `3px solid ${sev.color}` }]}>
              <View style={s.issueHeader}>
                <Text style={[s.issueBadge, { color: sev.color }]}>{sev.label}</Text>
                <Text style={s.issueNumber}>#{i + 1}</Text>
              </View>
              <Text style={s.issueTitle}>{issue.title}</Text>
              <Text style={s.issueDetail}>{issue.detail}</Text>
            </View>
          );
        })}

        <Footer pageNum={4} />
      </Page>

      {/* ── PAGE 5: RECOMMENDATIONS + CTA ── */}
      <Page size="LETTER" style={s.page}>
        <Header />
        <Text style={s.pageTitle}>Acciones Recomendadas</Text>
        <View style={s.accentLine} />
        <Text style={s.subtitle}>Las acciones inmediatas para recuperar el control de tu portal HubSpot.</Text>

        {recommendations.map((rec, i) => (
          <View key={i} style={s.recItem}>
            <View style={s.recCircle}>
              <Text style={s.recNum}>{i + 1}</Text>
            </View>
            <Text style={s.recText}>{rec}</Text>
          </View>
        ))}

        {/* CTA */}
        <View style={s.ctaBox}>
          <Text style={s.ctaTitle}>¿Listo para recuperar tu portal?</Text>
          <Text style={s.ctaSub}>Focux es el único partner HubSpot en Latinoamérica con el</Text>
          <Text style={s.ctaSub}>Construction Industry Specialist Badge.</Text>
          <Text style={s.ctaContact}>santiago.ospina@focux.co  ·  focux.co</Text>
          <Link src="https://meetings.hubspot.com/sospina" style={s.ctaLink}>
            Agenda tu consultoría → meetings.hubspot.com/sospina
          </Link>
        </View>

        <Footer pageNum={5} />
      </Page>
    </Document>
  );
}

/* ═══ EXPORT FUNCTION ═══ */
export async function generateScanPDF(scanData, clientName) {
  const scanDate = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const blob = await pdf(
    <ScanReportDocument scanData={scanData} clientName={clientName} scanDate={scanDate} />
  ).toBlob();

  saveAs(blob, `FocuxScan_${clientName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default ScanReportDocument;
