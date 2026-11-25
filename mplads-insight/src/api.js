let csrf = "";
export function setSession(user) {
  csrf = user?.csrf || "";
}
export async function api(path, options = {}) {
  const form = options.body instanceof FormData;
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !form ? { "Content-Type": "application/json" } : {}),
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
    body: options.body && !form ? JSON.stringify(options.body) : options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && csrf && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("insight-expired"));
    const detail = data.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ||
          (Array.isArray(detail)
            ? detail.map((e) => e.loc.join(".") + ": " + e.msg).join("; ")
            : "Something went wrong. Please try again.");
    const error = new Error(message);
    error.details = detail?.errors;
    error.status = response.status;
    throw error;
  }
  return data;
}
export const money = (n = 0, compact = true) =>
  compact
    ? n >= 1e7
      ? "₹" + (n / 1e7).toFixed(2) + " Cr"
      : n >= 1e5
        ? "₹" + (n / 1e5).toFixed(2) + " L"
        : "₹" +
          new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)
    : "₹" +
      new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
export const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not yet";
export const roleNames = {
  ministry: "Ministry administrator",
  state: "State nodal authority",
  district: "District authority",
  mp: "Member of Parliament",
};
export const sectors = [
  "Education",
  "Drinking water",
  "Roads & bridges",
  "Healthcare",
  "Community assets",
  "Sanitation",
];
export function query(params) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
  ).toString();
}
