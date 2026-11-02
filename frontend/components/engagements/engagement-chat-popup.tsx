"use client";

import * as React from "react";
import {
  MessageSquare,
  X,
  Send,
  Users,
  FileText,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Building2,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  ClientEngagementDetail,
  EngagementChatMessage,
  ChatParticipantsResponse,
  ChatParticipant,
  ChatChannel,
} from "@/types/engagement";

interface EngagementChatPopupProps {
  engagement: ClientEngagementDetail;
  initialOpen?: boolean;
}

export function EngagementChatPopup({
  engagement,
  initialOpen = false,
}: EngagementChatPopupProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const defaultUserName =
    user?.fullName ||
    (user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "") ||
    "Project Member";

  const [isOpen, setIsOpen] = React.useState(initialOpen);
  const [activeChannel, setActiveChannel] = React.useState<"all" | ChatChannel>("all");
  const [showParticipants, setShowParticipants] = React.useState(false);

  // Messages & participants
  const [messages, setMessages] = React.useState<EngagementChatMessage[]>([]);
  const [participants, setParticipants] = React.useState<ChatParticipant[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  // New message form state
  const [inputText, setInputText] = React.useState("");
  const [senderType, setSenderType] = React.useState<"member" | "client">("member");
  const [senderName, setSenderName] = React.useState(defaultUserName);
  const [senderRole, setSenderRole] = React.useState("Project Member");
  const [selectedProposalId, setSelectedProposalId] = React.useState<string>("");
  const [selectedIssueId, setSelectedIssueId] = React.useState<string>("");

  React.useEffect(() => {
    if (defaultUserName && senderType === "member") {
      setSenderName(defaultUserName);
    }
  }, [defaultUserName, senderType]);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Load chat messages
  const fetchMessages = React.useCallback(async () => {
    if (!currentOrganization?.id || !engagement.id) return;
    try {
      const res = await apiClient.get<EngagementChatMessage[]>(
        API_ENDPOINTS.engagements.messages(engagement.id),
        {
          params: activeChannel !== "all" ? { channel: activeChannel } : undefined,
          organizationId: currentOrganization.id,
        }
      );
      if (Array.isArray(res)) {
        setMessages(res);
      }
    } catch {
      // Silently fail on network poll
    }
  }, [currentOrganization?.id, engagement.id, activeChannel]);

  // Load participants
  const fetchParticipants = React.useCallback(async () => {
    if (!currentOrganization?.id || !engagement.id) return;
    try {
      const res = await apiClient.get<ChatParticipantsResponse>(
        API_ENDPOINTS.engagements.participants(engagement.id),
        { organizationId: currentOrganization.id }
      );
      if (res && Array.isArray(res.members)) {
        setParticipants(res.members);
      }
    } catch {
      // Fallback
    }
  }, [currentOrganization?.id, engagement.id]);

  React.useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      Promise.all([fetchMessages(), fetchParticipants()]).finally(() => {
        setIsLoading(false);
      });
    }
  }, [isOpen, fetchMessages, fetchParticipants]);

  // Polling for new messages every 6 seconds when open
  React.useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      fetchMessages();
    }, 6000);
    return () => clearInterval(interval);
  }, [isOpen, fetchMessages]);

  // Auto scroll to bottom
  React.useEffect(() => {
    if (isOpen && messages.length > 0) {
      if (typeof messagesEndRef.current?.scrollIntoView === "function") {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, isOpen]);

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !currentOrganization?.id || isSending) return;

    setIsSending(true);
    const postChannel: ChatChannel = activeChannel === "all" ? "general" : activeChannel;

    try {
      const payload = {
        message: inputText.trim(),
        sender_name: senderName.trim() || "Team Member",
        sender_role: senderRole.trim() || (senderType === "client" ? "Client Stakeholder" : "Project Member"),
        sender_type: senderType,
        channel: postChannel,
        proposal_id: postChannel === "proposal" && selectedProposalId ? selectedProposalId : undefined,
        issue_id: postChannel === "disputes" && selectedIssueId ? selectedIssueId : undefined,
      };

      const res = await apiClient.post<EngagementChatMessage>(
        API_ENDPOINTS.engagements.messages(engagement.id),
        payload,
        { organizationId: currentOrganization.id }
      );

      if (res && res.id) {
        setMessages((prev) => [...prev, res]);
        setInputText("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      alert(msg);
    } finally {
      setIsSending(false);
    }
  };

  // Quick preset messages
  const handleInsertPreset = (text: string) => {
    setInputText(text);
  };

  const projectMembers = participants.filter((p) => p.participant_type === "member");
  const clientMembers = participants.filter((p) => p.participant_type === "client");

  return (
    <>
      {/* Floating Chat Symbol in the Right Bottom Corner */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`group relative flex items-center justify-center rounded-full p-4 shadow-2xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary-500/30 ${
            isOpen
              ? "bg-slate-900 text-white hover:bg-slate-800 rotate-90"
              : "bg-gradient-to-tr from-primary-600 to-indigo-600 text-white hover:scale-105 hover:shadow-primary-500/25 ring-2 ring-white/80 dark:ring-slate-800"
          }`}
          aria-label="Open Project & Client Chat Window"
        >
          {isOpen ? (
            <X className="h-6 w-6 transition-transform" />
          ) : (
            <>
              <MessageSquare className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white" />
              </span>
            </>
          )}

          {/* Tooltip badge */}
          {!isOpen && (
            <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-800">
              💬 Project & Client Chat
            </span>
          )}
        </button>
      </div>

      {/* Pop-up Chatting Window in Right Bottom Corner */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Project Engagement Discussion Window"
          className="fixed bottom-20 right-6 z-50 flex h-[580px] max-h-[calc(100vh-6.5rem)] w-[410px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 animate-in fade-in slide-in-from-bottom-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-600 text-white shadow-sm font-bold text-xs">
                💬
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                    {engagement.title}
                  </h3>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                </div>
                <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                  {engagement.engagement_code} • {engagement.client_name || "Client"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowParticipants((prev) => !prev)}
                className={`h-7 px-2 text-xs gap-1 font-medium ${
                  showParticipants ? "bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-400"
                }`}
                title="View Project Members and Client Contacts"
              >
                <Users className="h-3.5 w-3.5 text-primary-600" />
                <span className="text-[11px]">{participants.length > 0 ? participants.length : "Team"}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchMessages}
                className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                title="Refresh messages"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                title="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Participants Dropdown / Drawer */}
          {showParticipants && (
            <div className="border-b border-slate-200/80 bg-slate-50/95 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/90 max-h-48 overflow-y-auto space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider flex items-center gap-1">
                  <Briefcase className="h-3 w-3 text-primary-600" />
                  Project Team Members ({projectMembers.length})
                </span>
              </div>
              <div className="space-y-1">
                {projectMembers.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No assigned project members yet.</p>
                ) : (
                  projectMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-md bg-white dark:bg-slate-900 px-2.5 py-1 border border-slate-200/60 dark:border-slate-800"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">{m.name}</span>
                      <span className="text-[10px] text-primary-600 dark:text-primary-400 font-medium">
                        {m.role}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-emerald-600" />
                  Client Stakeholders ({clientMembers.length})
                </span>
              </div>
              <div className="space-y-1">
                {clientMembers.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    {engagement.client_name || "Client Organization"}
                  </p>
                ) : (
                  clientMembers.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-md bg-white dark:bg-slate-900 px-2.5 py-1 border border-slate-200/60 dark:border-slate-800"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {c.role}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Channel Tabs */}
          <div className="flex border-b border-slate-200/80 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveChannel("all")}
              className={`flex-1 rounded-md py-1 px-1.5 text-center font-medium transition-colors text-[11px] ${
                activeChannel === "all"
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              All Messages
            </button>
            <button
              type="button"
              onClick={() => setActiveChannel("general")}
              className={`flex-1 rounded-md py-1 px-1.5 text-center font-medium transition-colors text-[11px] ${
                activeChannel === "general"
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 font-semibold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              💬 General
            </button>
            <button
              type="button"
              onClick={() => setActiveChannel("proposal")}
              className={`flex-1 rounded-md py-1 px-1.5 text-center font-medium transition-colors text-[11px] ${
                activeChannel === "proposal"
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              📋 Proposals
            </button>
            <button
              type="button"
              onClick={() => setActiveChannel("disputes")}
              className={`flex-1 rounded-md py-1 px-1.5 text-center font-medium transition-colors text-[11px] ${
                activeChannel === "disputes"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-semibold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              ⚖️ Disputes
            </button>
          </div>

          {/* Proposals / Disputes context selectors when active */}
          {activeChannel === "proposal" && engagement.proposals.length > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-1.5 border-b border-indigo-100 dark:border-indigo-900/50 text-xs">
              <FileText className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              <span className="text-[10px] font-semibold text-indigo-800 dark:text-indigo-300">
                Discuss Proposal:
              </span>
              <select
                value={selectedProposalId}
                onChange={(e) => setSelectedProposalId(e.target.value)}
                className="h-6 flex-1 rounded bg-white text-[11px] text-slate-800 border border-indigo-200/80 px-1.5 focus:outline-none dark:bg-slate-900 dark:text-slate-200 dark:border-indigo-800"
              >
                <option value="">(All or General Proposal Discussion)</option>
                {engagement.proposals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.proposal_number}: {p.title} ({p.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeChannel === "disputes" && engagement.issues.length > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50/70 dark:bg-amber-950/40 px-3 py-1.5 border-b border-amber-100 dark:border-amber-900/50 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                Clear Dispute / Issue:
              </span>
              <select
                value={selectedIssueId}
                onChange={(e) => setSelectedIssueId(e.target.value)}
                className="h-6 flex-1 rounded bg-white text-[11px] text-slate-800 border border-amber-200/80 px-1.5 focus:outline-none dark:bg-slate-900 dark:text-slate-200 dark:border-amber-800"
              >
                <option value="">(All or General Dispute Discussion)</option>
                {engagement.issues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.issue_number}: {i.title} [{i.status}]
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50 dark:bg-slate-950/50">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-4">
                <div className="h-10 w-10 rounded-full bg-primary-50 dark:bg-primary-950/50 text-primary-600 flex items-center justify-center mb-2">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {activeChannel === "proposal"
                    ? "Discuss Commercial Proposals"
                    : activeChannel === "disputes"
                    ? "Clear Queries & Project Disputes"
                    : "No Messages Yet"}
                </h4>
                <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                  Start the conversation between project team members and{" "}
                  <strong>{engagement.client_name || "the client"}</strong>.
                </p>

                {/* Preset suggestions */}
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center max-w-xs">
                  {activeChannel === "proposal" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset(
                            "We have reviewed the proposal deliverables and agreed to proceed."
                          )
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 text-[10px] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
                      >
                        ✓ Agree on deliverables
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset(
                            "Could we adjust milestone 2 payment terms to 30 days after UAT signoff?"
                          )
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 text-[10px] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
                      >
                        💳 Review payment terms
                      </button>
                    </>
                  ) : activeChannel === "disputes" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset(
                            "Dispute resolution update: The root cause has been addressed and tested on staging."
                          )
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 px-2.5 py-1 text-[10px] text-amber-700 dark:text-amber-300 hover:bg-amber-50"
                      >
                        🔧 Root cause resolved
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset(
                            "Client clarification: Scope confirmed, we can mark this dispute cleared."
                          )
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 px-2.5 py-1 text-[10px] text-amber-700 dark:text-amber-300 hover:bg-amber-50"
                      >
                        ✅ Confirm dispute cleared
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset(
                            "Hello team! Starting our project discussion thread for sprint deliverables."
                          )
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[10px] text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                      >
                        👋 Welcome team & client
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isClient = m.sender_type === "client";
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col space-y-1 ${
                      isClient ? "items-start" : "items-end"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {m.sender_name}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-medium border ${
                          isClient
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                            : "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-950/60 dark:text-primary-300 dark:border-primary-800"
                        }`}
                      >
                        {m.sender_role}
                      </span>
                      <span className="text-slate-400">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-sm leading-relaxed ${
                        isClient
                          ? "bg-white text-slate-800 border border-slate-200/80 rounded-tl-sm dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800"
                          : "bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-tr-sm"
                      }`}
                    >
                      {/* Attached proposal or issue badge */}
                      {m.proposal_title && (
                        <div
                          className={`mb-1.5 flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                            isClient
                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                              : "bg-white/15 text-indigo-100"
                          }`}
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">Proposal: {m.proposal_title}</span>
                        </div>
                      )}
                      {m.issue_title && (
                        <div
                          className={`mb-1.5 flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${
                            isClient
                              ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                              : "bg-white/15 text-amber-100"
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span className="truncate">Dispute/Query: {m.issue_title}</span>
                        </div>
                      )}

                      <p className="whitespace-pre-wrap break-words">{m.message}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Posting Persona Bar */}
          <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/90 px-3 py-1.5 text-[10px] dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center gap-1 text-slate-500">
              <span>Posting as:</span>
              <button
                type="button"
                onClick={() => {
                  if (senderType === "member") {
                    setSenderType("client");
                    setSenderName(engagement.client_name || "Client Stakeholder");
                    setSenderRole("Client Contact");
                  } else {
                    setSenderType("member");
                    setSenderName(defaultUserName);
                    setSenderRole("Project Member");
                  }
                }}
                className={`font-semibold rounded px-1.5 py-0.5 border text-[10px] transition-colors ${
                  senderType === "client"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "bg-primary-50 text-primary-800 border-primary-300 dark:bg-primary-950/60 dark:text-primary-300"
                }`}
                title="Click to toggle posting between Project Member and Client"
              >
                {senderType === "client" ? "🏢 Client" : "💻 Project Member"} ({senderName})
              </button>
            </div>

            <div className="text-[10px] text-slate-400">
              {activeChannel === "all" ? "Channel: General" : `Channel: ${activeChannel}`}
            </div>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="flex items-center gap-2 border-t border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                activeChannel === "proposal"
                  ? "Discuss proposal terms, deliverables, pricing..."
                  : activeChannel === "disputes"
                  ? "Clarify or resolve project dispute / query..."
                  : "Type message to project members & client..."
              }
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!inputText.trim() || isSending}
              className="h-8 w-8 rounded-xl p-0 bg-primary-600 hover:bg-primary-700 text-white shrink-0 shadow-sm"
              title="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
