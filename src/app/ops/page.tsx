import OpsWizard from "./OpsClient";

export const metadata = {
  title: "FocuxAI Ops — Configurador HubSpot",
  description: "Wizard de configuración para implementaciones HubSpot en constructoras",
};

export default function OpsPage() {
  return <OpsWizard />;
}
