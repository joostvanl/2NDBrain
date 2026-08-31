import "../server/load-env.mjs";
import { diagnoseConfluenceAuth, resetConfluenceGatewaySession } from "../server/nexus/nexus-confluence.mjs";

resetConfluenceGatewaySession();
const result = await diagnoseConfluenceAuth();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
