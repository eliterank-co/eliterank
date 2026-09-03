// Test stub for @vercel/botid — the optional Vercel bot-detection package
// that api/cast-anonymous-vote.js dynamically imports only when
// BOTID_ENABLED=true. It is not a declared dependency, so without this
// stub Vite cannot resolve the specifier while transforming the handler
// for tests. Never votes "bot".
export async function checkBotId() {
  return { passed: true };
}