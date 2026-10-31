// Placeholder entry point until Milestone 3: proves the tsc → public/js pipeline
// and that the API answers.
const status = document.querySelector<HTMLElement>("[data-api-status]");

if (status) {
  try {
    const response = await fetch("/api/health");
    const body: { db?: string } = await response.json();
    status.textContent = response.ok ? `API: ok · database: ${body.db}` : `API: error ${response.status}`;
  } catch {
    status.textContent = "API: unreachable";
  }
}
