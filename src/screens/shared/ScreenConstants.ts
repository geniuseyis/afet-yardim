export const C = {
  red: "#dc2626",
  darkRed: "#991b1b",
  blue: "#2563eb",
  green: "#10b981",
  amber: "#f59e0b",
  bg: "#f3f6fb",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#475569",
  dark: "#0f172a"
};

export const aidTypes = [
  { key: "health", label: "Sağlık / Yaralı", labelEn: "Health / Injured", icon: "medical", color: "#dc2626", bg: "#fee2e2" },
  { key: "accident", label: "Trafik / Araç Kazası", labelEn: "Traffic Accident", icon: "car-sport", color: "#b91c1c", bg: "#fee2e2" },
  { key: "fire", label: "Yangın", labelEn: "Fire", icon: "flame", color: "#ea580c", bg: "#ffedd5" },
  { key: "debris", label: "Enkaz / Arama-Kurtarma", labelEn: "Debris / Search-Rescue", icon: "construct", color: "#7c2d12", bg: "#fed7aa" },
  { key: "flood", label: "Sel / Su Baskını", labelEn: "Flood", icon: "rainy", color: "#0369a1", bg: "#dbeafe" },
  { key: "structural", label: "Yapısal Hasar", labelEn: "Structural Damage", icon: "warning", color: "#a16207", bg: "#fef3c7" },
  { key: "gas_leak", label: "Gaz Kaçağı / Tehlikeli Madde", labelEn: "Gas Leak / Hazmat", icon: "skull", color: "#7c3aed", bg: "#ede9fe" },
  { key: "missing", label: "Kayıp Kişi", labelEn: "Missing Person", icon: "person-remove", color: "#be185d", bg: "#fce7f3" },
  { key: "animal", label: "Hayvan Kurtarma", labelEn: "Animal Rescue", icon: "paw", color: "#0d9488", bg: "#ccfbf1" },
  { key: "food", label: "Gıda", labelEn: "Food", icon: "fast-food", color: "#d97706", bg: "#fef3c7" },
  { key: "shelter", label: "Barınma", labelEn: "Shelter", icon: "home", color: "#65a30d", bg: "#ecfccb" },
  { key: "baby", label: "Bebek İhtiyaçları", labelEn: "Baby Needs", icon: "happy", color: "#8b5cf6", bg: "#ede9fe" },
  { key: "water", label: "Su / Elektrik", labelEn: "Water / Power", icon: "water", color: "#0284c7", bg: "#e0f2fe" },
  { key: "transport", label: "Ulaşım", labelEn: "Transport", icon: "car", color: "#0891b2", bg: "#e0f7fa" },
  { key: "psych", label: "Psikolojik Destek", labelEn: "Mental Support", icon: "heart", color: "#e879f9", bg: "#fdf4ff" },
  { key: "other", label: "Diğer", labelEn: "Other", icon: "apps", color: "#6b7280", bg: "#f3f4f6" }
] as const;

export const statusLabel: Record<string, string> = {
  open: "Bekliyor",
  assigned: "Gönüllü atandı",
  in_progress: "Yardım yolda",
  closed: "Tamamlandı"
};

export const steps = ["Talep Alındı", "İnceleniyor", "Gönüllü Atandı", "Yardım Yolda", "Yardım Ulaştı"];

