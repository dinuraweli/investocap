/** YYYY-MM-DD for an epoch-ms timestamp in Sri Lanka time. */
export const colomboDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
