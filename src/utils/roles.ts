export type NormalizedRole = "victim" | "volunteer" | "coordinator" | null;

export const normalizeRole = (value: unknown): NormalizedRole => {
  const role = String(value || "").trim().toLocaleLowerCase("tr");
  if (!role) return null;
  if (["victim", "afetzede"].includes(role)) return "victim";
  if (["volunteer", "gonullu", "gönüllü"].includes(role)) return "volunteer";
  if (["coordinator", "yonetici", "yönetici", "admin"].includes(role)) return "coordinator";
  return null;
};

