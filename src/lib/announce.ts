// Screen-reader announcements through the one shared polite live region (#sr-status in BaseLayout).
export function announce(message: string): void {
  const region = document.getElementById("sr-status");
  if (!region) return;
  region.textContent = "";
  // clearing first, then setting after a moment, makes screen readers repeat identical messages
  setTimeout(() => { region.textContent = message; }, 60);
}
