// Shim → re-export from PostgreSQL DB layer (src/lib/db/)
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById, getDistinctProviders,
} from "@/lib/db/index.js";
