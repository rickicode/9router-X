// Shim → re-export from PostgreSQL DB layer (src/lib/db/)
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById, getDistinctProviders, getFailureAnalytics,
} from "@/lib/db/index.js";
