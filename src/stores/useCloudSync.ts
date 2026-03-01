import { useCallback, useRef, useState } from "react";
import { useStore, type CloudConnection } from "./store";
import type { DatabaseConfig } from "../types";
import { CLOUD_URL } from "../constants";

interface CloudConnectionsResponse {
  connections: CloudConnection[];
}

interface CloudConnectionsErrorResponse {
  error: string;
}

interface CreateConnectionResponse {
  connection: CloudConnection;
}

interface UpdateConnectionResponse {
  connection: CloudConnection;
}

interface UpdateCloudConnectionResult {
  success: boolean;
  error?: string;
}

interface DeleteCloudConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * Hook for syncing database connections from the cloud.
 * Follows the pattern from useSyncDatabase.ts for race condition handling.
 */
export function useCloudSync() {
  const cloudApiKey = useStore((state) => state.cloudApiKey);
  const cloudSyncState = useStore((state) => state.cloudSyncState);
  const setCloudSyncState = useStore((state) => state.setCloudSyncState);
  const syncCloudConfigs = useStore((state) => state.syncCloudConfigs);
  const convertToCloudConfig = useStore((state) => state.convertToCloudConfig);

  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Use ref to track current execution ID to handle race conditions
  const currentExecutionRef = useRef<string | null>(null);

  const sync = useCallback(async () => {
    if (!cloudApiKey) {
      return;
    }

    // Generate unique execution ID for race condition handling
    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    currentExecutionRef.current = executionId;

    // Set syncing state
    setCloudSyncState({
      status: "syncing",
      error: null,
    });

    try {
      const response = await fetch(`${CLOUD_URL}/api/connections`, {
        method: "GET",
        headers: {
          "x-api-key": cloudApiKey,
        },
      });

      // Check if this execution is still current (race condition check)
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      if (!response.ok) {
        const data = (await response.json()) as CloudConnectionsErrorResponse;
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as CloudConnectionsResponse;

      // Double-check after async operation
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      // Update the store with cloud connections
      syncCloudConfigs(data.connections);

      setCloudSyncState({
        status: "completed",
        lastSyncedAt: Date.now(),
        error: null,
      });
    } catch (err) {
      // Check if this execution is still current
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      setCloudSyncState({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [cloudApiKey, setCloudSyncState, syncCloudConfigs]);

  const transferToCloud = useCallback(
    async (config: DatabaseConfig) => {
      if (!cloudApiKey) {
        setTransferError("No cloud API key configured");
        return;
      }

      setTransferringId(config.id);
      setTransferError(null);

      try {
        const response = await fetch(`${CLOUD_URL}/api/connections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cloudApiKey,
          },
          body: JSON.stringify({
            name: config.display.name,
            config: {
              display: config.display,
              connection: config.connection,
            },
          }),
        });

        if (!response.ok) {
          const data = (await response.json()) as CloudConnectionsErrorResponse;
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        const data = (await response.json()) as CreateConnectionResponse;
        const conn = data.connection;

        // Convert the local config to a cloud config
        convertToCloudConfig(config.id, {
          id: conn.id,
          ownerId: conn.ownerId,
          ownerEmail: conn.ownerEmail,
          role: conn.role,
          access: conn.access,
          updatedAt: conn.updatedAt,
        });
      } catch (err) {
        setTransferError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setTransferringId(null);
      }
    },
    [cloudApiKey, convertToCloudConfig],
  );

  const updateCloudConnection = useCallback(
    async (config: DatabaseConfig): Promise<UpdateCloudConnectionResult> => {
      if (!cloudApiKey) {
        const error = "No cloud API key configured";
        setUpdateError(error);
        return { success: false, error };
      }

      if (config.source !== "cloud" || !config.cloud?.id) {
        const error = "Config is not a cloud connection";
        setUpdateError(error);
        return { success: false, error };
      }

      setIsUpdating(true);
      setUpdateError(null);

      try {
        const response = await fetch(`${CLOUD_URL}/api/connections`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cloudApiKey,
          },
          body: JSON.stringify({
            id: config.cloud.id,
            name: config.display.name,
            config: {
              display: config.display,
              connection: config.connection,
            },
          }),
        });

        if (!response.ok) {
          const data = (await response.json()) as CloudConnectionsErrorResponse;
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        // Parse response to confirm success
        (await response.json()) as UpdateConnectionResponse;

        return { success: true };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        setUpdateError(error);
        return { success: false, error };
      } finally {
        setIsUpdating(false);
      }
    },
    [cloudApiKey],
  );

  const deleteCloudConnection = useCallback(
    async (cloudId: string): Promise<DeleteCloudConnectionResult> => {
      if (!cloudApiKey) {
        const error = "No cloud API key configured";
        setDeleteError(error);
        return { success: false, error };
      }

      setIsDeleting(true);
      setDeleteError(null);

      try {
        const response = await fetch(
          `${CLOUD_URL}/api/connections/${cloudId}`,
          {
            method: "DELETE",
            headers: {
              "x-api-key": cloudApiKey,
            },
          },
        );

        if (!response.ok) {
          const data = (await response.json()) as CloudConnectionsErrorResponse;
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        return { success: true };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        setDeleteError(error);
        return { success: false, error };
      } finally {
        setIsDeleting(false);
      }
    },
    [cloudApiKey],
  );

  return {
    sync,
    isSyncing: cloudSyncState.status === "syncing",
    error: cloudSyncState.error,
    lastSyncedAt: cloudSyncState.lastSyncedAt,
    transferToCloud,
    transferringId,
    transferError,
    updateCloudConnection,
    isUpdating,
    updateError,
    deleteCloudConnection,
    isDeleting,
    deleteError,
  };
}
