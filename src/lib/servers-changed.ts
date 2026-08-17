/** Notify sidebar (and other listeners) to refresh server list/status. */
export function notifyServersChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ophiussa:servers-changed"));
  }
}
