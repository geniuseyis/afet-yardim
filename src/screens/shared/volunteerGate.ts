import { normalizeRole } from "../../utils/roles";

export const isVolunteerApproved = (userData: any): boolean => {
  if (!userData) return false;
  if (normalizeRole(userData.role) !== "volunteer") return false;

  const status = String(userData.volunteerStatus || "").toLocaleLowerCase("tr");
  if (userData.isApprovedVolunteer === true) return true;
  if (["approved", "onayli", "onaylı"].includes(status)) return true;

  // basvuran koordinator onaylayana kadar gorev ekranina giremez
  return false;
};

