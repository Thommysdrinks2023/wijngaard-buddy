import { useEffect, useState } from "react";
import {
  CONFIG_GEWIJZIGD_EVENT,
  getWijngaardConfig,
  type WijngaardConfig,
} from "./wijngaard-config";

// Reactieve toegang tot de wijngaard-configuratie: werkt automatisch bij
// zodra de configuratie wijzigt (bijv. via de instellingen-pagina).
export function useWijngaardConfig(): WijngaardConfig {
  const [config, setConfig] = useState<WijngaardConfig>(() => getWijngaardConfig());
  useEffect(() => {
    const upd = () => setConfig(getWijngaardConfig());
    upd();
    window.addEventListener(CONFIG_GEWIJZIGD_EVENT, upd);
    return () => window.removeEventListener(CONFIG_GEWIJZIGD_EVENT, upd);
  }, []);
  return config;
}
