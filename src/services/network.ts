/**
 * NETWORK PROBE
 * Lightweight connectivity probe for offline banner and fallback strategy.
 */
export const probeOnline = async (timeoutMs = 2500): Promise<boolean> => {
  try {
    const fetchPromise = fetch("https://www.gstatic.com/generate_204", {
      method: "GET",
      cache: "no-store"
    }).then((res) => res.status >= 200 && res.status < 400).catch(() => false);
    const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch {
    return false;
  }
};

