import { useState, useEffect, useCallback } from "react";
import type { DatabaseConfig, ConnectionMember, AccessMap } from "../types";
import { useHotkey } from "../stores/hooks";
import { useStore } from "../stores";
import { CLOUD_URL } from "../constants";
import { MemberAccessEditor } from "./MemberAccessEditor";

interface MembersModalProps {
  config: DatabaseConfig;
  onClose: () => void;
}

interface MembersResponse {
  members: ConnectionMember[];
}

interface MemberResponse {
  member: ConnectionMember;
}

interface ErrorResponse {
  error: string;
}

function TrashIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

type AccessPreset = "full" | "read-only" | "no-access";

const PRESET_MAP: Record<AccessPreset, AccessMap> = {
  full: { "*": "write" },
  "read-only": { "*": "read" },
  "no-access": { "*": "none" },
};

function getAccessSummary(access: AccessMap): {
  label: string;
  color: string;
} {
  const keys = Object.keys(access);
  if (keys.length === 1 && access["*"] === "write") {
    return {
      label: "Full Access",
      color:
        "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400",
    };
  }
  if (keys.length === 1 && access["*"] === "read") {
    return {
      label: "Read Only",
      color:
        "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400",
    };
  }
  if (keys.length === 1 && access["*"] === "none") {
    return {
      label: "No Access",
      color: "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400",
    };
  }
  return {
    label: "Custom",
    color: "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400",
  };
}

export function MembersModal({ config, onClose }: MembersModalProps) {
  const cloudApiKey = useStore((s) => s.cloudApiKey);

  const [members, setMembers] = useState<ConnectionMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newAccessPreset, setNewAccessPreset] = useState<AccessPreset>("full");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  useHotkey("closeModal", onClose);

  const cloudId = config.cloud?.id;
  const schemas = config.cache?.schemas ?? [];

  const fetchMembers = useCallback(async () => {
    if (!cloudApiKey || !cloudId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${CLOUD_URL}/api/connections/${cloudId}/members`,
        {
          headers: {
            "x-api-key": cloudApiKey,
          },
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as MembersResponse;
      setMembers(data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, [cloudApiKey, cloudId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!cloudApiKey || !cloudId || !newEmail.trim()) return;

    setIsAdding(true);
    setAddError(null);

    try {
      const response = await fetch(
        `${CLOUD_URL}/api/connections/${cloudId}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cloudApiKey,
          },
          body: JSON.stringify({
            email: newEmail.trim(),
            access: PRESET_MAP[newAccessPreset],
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as MemberResponse;
      setMembers((prev) => [...prev, data.member]);
      setNewEmail("");
      setNewAccessPreset("full");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleUpdateAccess(memberId: string, access: AccessMap) {
    if (!cloudApiKey || !cloudId) return;

    setIsSavingAccess(true);

    try {
      const response = await fetch(
        `${CLOUD_URL}/api/connections/${cloudId}/members/${memberId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cloudApiKey,
          },
          body: JSON.stringify({ access }),
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as MemberResponse;
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? data.member : m)),
      );
      setSelectedMemberId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setIsSavingAccess(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!cloudApiKey || !cloudId) return;

    setRemovingMemberId(memberId);

    try {
      const response = await fetch(
        `${CLOUD_URL}/api/connections/${cloudId}/members/${memberId}`,
        {
          method: "DELETE",
          headers: {
            "x-api-key": cloudApiKey,
          },
        },
      );

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  const selectedMember = selectedMemberId
    ? members.find((m) => m.id === selectedMemberId)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-lg mx-4 border border-stone-200 dark:border-white/10">
        <div className="p-6">
          {selectedMember ? (
            /* Detail view - Access editor */
            <MemberAccessEditor
              member={selectedMember}
              schemas={schemas}
              onSave={(access) => handleUpdateAccess(selectedMember.id, access)}
              onBack={() => setSelectedMemberId(null)}
              isSaving={isSavingAccess}
            />
          ) : (
            /* List view */
            <>
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: config.display.color }}
                />
                <h2 className="text-[18px] font-semibold text-primary">
                  Manage Members
                </h2>
              </div>

              <p className="text-[13px] text-secondary mb-4">
                Add members by email to grant them access to{" "}
                <span className="font-medium text-primary">
                  {config.display.name}
                </span>
                . They'll get access when they sign in with that email.
              </p>

              {/* Error message */}
              {error && (
                <div className="mb-4 p-3 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20">
                  {error}
                </div>
              )}

              {/* Members list */}
              <div className="mb-6">
                <label className="block text-[12px] font-medium text-secondary mb-2">
                  Members
                </label>
                {isLoading ? (
                  <div className="py-8 text-center text-[13px] text-tertiary">
                    Loading members...
                  </div>
                ) : members.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-tertiary border border-dashed border-stone-200 dark:border-white/10 rounded-lg">
                    No members yet. Add someone below.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {members.map((member) => {
                      const summary = getAccessSummary(member.access);
                      return (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/[0.06] rounded-lg hover:bg-stone-100 dark:hover:bg-white/[0.04] cursor-pointer transition-colors"
                          onClick={() => setSelectedMemberId(member.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] text-primary truncate">
                              {member.email}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium rounded ${summary.color}`}
                          >
                            {summary.label}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMember(member.id);
                            }}
                            disabled={removingMemberId === member.id}
                            className="p-1.5 rounded text-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            title="Remove member"
                          >
                            {removingMemberId === member.id ? (
                              <Spinner />
                            ) : (
                              <TrashIcon />
                            )}
                          </button>
                          <span className="text-tertiary">
                            <ChevronRightIcon />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add member form */}
              <form onSubmit={handleAddMember} className="space-y-3">
                <label className="block text-[12px] font-medium text-secondary">
                  Add Member
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                    disabled={isAdding}
                    className="flex-1 px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50"
                  />
                  <select
                    value={newAccessPreset}
                    onChange={(e) =>
                      setNewAccessPreset(e.target.value as AccessPreset)
                    }
                    disabled={isAdding}
                    className="px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                  >
                    <option value="full">Full Access</option>
                    <option value="read-only">Read Only</option>
                    <option value="no-access">No Access</option>
                  </select>
                  <button
                    type="submit"
                    disabled={isAdding || !newEmail.trim()}
                    className="px-4 py-2 text-[14px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isAdding && <Spinner />}
                    Add
                  </button>
                </div>
                {addError && (
                  <p className="text-[12px] text-red-500">{addError}</p>
                )}
              </form>

              {/* Close button */}
              <div className="flex justify-end mt-6 pt-4 border-t border-stone-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
