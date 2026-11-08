export type Role = "victim" | "volunteer" | "coordinator";

export type RequestAction = "START_ROUTE" | "COMPLETE" | "REOPEN";

export const riskKeywords = [
  "kanama",
  "bilincsiz",
  "nefes",
  "enkaz",
  "yangin",
  "patlama",
  "kalp",
  "intihar",
  "cocuk kayip"
];

export const resolvedRole = (token: any): Role | null => {
  const role = `${token?.role || ""}`.trim().toLocaleLowerCase("tr");
  if (role === "coordinator" || role === "yonetici" || role === "yönetici" || role === "admin" || token?.coordinator === true) return "coordinator";
  if (role === "volunteer" || role === "gonullu" || role === "gönüllü" || token?.volunteer === true) return "volunteer";
  if (role === "victim" || role === "afetzede" || token?.victim === true) return "victim";
  return null;
};

export const urgentScore = (urgency?: string): number => {
  const u = `${urgency || ""}`.toLowerCase();
  if (u.includes("acil") || u.includes("yuksek")) return 100;
  if (u.includes("orta")) return 60;
  return 30;
};

export const detectRisk = (text?: string): boolean => {
  const lower = `${text || ""}`.toLowerCase();
  return riskKeywords.some((k) => lower.includes(k));
};

export const transitionStatusForAction = (action: string): "in_progress" | "closed" | "open" | null => {
  if (action === "START_ROUTE") return "in_progress";
  if (action === "COMPLETE") return "closed";
  if (action === "REOPEN") return "open";
  return null;
};

export const canTransitionRequest = (params: {
  action: string;
  role: Role | null;
  actorId: string;
  assignedVolunteerId?: string | null;
}): boolean => {
  const { action, role, actorId, assignedVolunteerId } = params;

  if (action === "REOPEN") return role === "coordinator";

  if (action === "START_ROUTE" || action === "COMPLETE") {
    if (role === "coordinator") return true;
    return role === "volunteer" && assignedVolunteerId === actorId;
  }

  return false;
};
