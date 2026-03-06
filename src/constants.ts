export const CLOUD_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://cloud.dbdiff.app";

// Set to true to show cloud linking/sync UI
export const CLOUD_ENABLED = false;

// Disable for cloud-hosted deployments where localhost isn't accessible
export const LOCALHOST_SCANNING_ENABLED = true;

export const PAGE_SIZE = 500;

export const APP_VERSION = "0.1.2";
