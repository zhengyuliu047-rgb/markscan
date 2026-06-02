import { isSetupComplete } from "../../utils/auth";

export default defineEventHandler(async () => ({ initialized: await isSetupComplete() }));
