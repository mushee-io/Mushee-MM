// Explicit Vercel Function entry point for all /api/v1/* routes.
// The rewrite preserves the original path; api/index.js owns authorization
// and request handling. Static explorer and homepage remain in /public.
import handler from "./index.js";
export default handler;
