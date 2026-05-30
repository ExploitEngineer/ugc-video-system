// Lightweight runtime logger for agent runs. Prints a short run id + message to
// the backend console so you can see exactly which step a run is on and where
// it failed. Called only from the orchestrator + skill boundaries while a run
// is being driven, so an idle server stays quiet.

const short = (runId: string) => runId.slice(0, 8);
const stamp = () => new Date().toISOString().slice(11, 23);

/** Info line: `12:34:56.789 [run 54607891] ▶ product_inspection …` */
export function logRun(runId: string, msg: string): void {
  console.log(`${stamp()} [run ${short(runId)}] ${msg}`);
}

/** Error line (stderr): `… [run 54607891] ✗ product_inspection failed: …` */
export function logRunError(runId: string, msg: string): void {
  console.error(`${stamp()} [run ${short(runId)}] ✗ ${msg}`);
}
