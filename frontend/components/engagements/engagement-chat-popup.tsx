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
  Lock,
  ShieldCheck,
  Wifi,
  WifiOff,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { env } from "@/lib/config/env";
import type {
  ClientEngagementDetail,
  EngagementChatMessage,
  ChatParticipantsResponse,
  ChatParticipant,
  WsTicketResponse,
  ChatConnectionState,
  ChatConversation,
} from "@/types/engagement";

interface EngagementChatPopupProps {
  engagement: ClientEngagementDetail;
  initialOpen?: boolean;
}

export function EngagementChatPopup({
  engagement,
  initialOpen = false,
}: EngagementChatPopupProps) {
  const { currentOrganization, membership } = useOrganization();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = React.useState(initialOpen);
  const [showParticipants, setShowParticipants] = React.useState(false);

  // Active conversation tab: "client" (Client Chat) or "internal" (Team Chat)
  const [activeTab, setActiveTab] = React.useState<ChatConversation>("client");

  // Dual-perspective testing switcher for testing account
  // Testing account: officeos@gmail.com, auth user 00000000-0000-0000-0000-000000000001, or organization owner/admin
  const isTestingAccount = React.useMemo(() => {
    if (!user) return false;
    const testEmails = ["officeos@gmail.com", "aritra@example.com", "admin@officeos.com"];
    const testIds = ["00000000-0000-0000-0000-000000000001"];
    const isOwnerOrAdmin = membership?.role === "owner" || membership?.role === "admin";
    return (
      (user.email && testEmails.includes(user.email.toLowerCase())) ||
      testIds.includes(user.id) ||
      isOwnerOrAdmin
    );
  }, [user, membership]);

  // Simulated perspective for testing: "member" or "client"
  const [testPerspective, setTestPerspective] = React.useState<"member" | "client">("member");

  // Determine if the user is authorized to view & access Team Chat
  // If simulated as client in testing mode, Team Chat is forbidden and hidden
  const canAccessTeamChat = React.useMemo(() => {
    if (isTestingAccount && testPerspective === "client") {
      return false;
    }
    // Organization members/employees can access Team Chat
    if (membership) {
      return true;
    }
    // If not testing account and not membership, default to false (client user)
    return false;
  }, [isTestingAccount, testPerspective, membership]);

  // If user loses permission to view Team Chat (e.g. toggled to Client perspective), switch tab to client
  React.useEffect(() => {
    if (!canAccessTeamChat && activeTab === "internal") {
      setActiveTab("client");
    }
  }, [canAccessTeamChat, activeTab]);

  // Independent message histories for Client Chat and Team Chat
  const [clientMessages, setClientMessages] = React.useState<EngagementChatMessage[]>([]);
  const [teamMessages, setTeamMessages] = React.useState<EngagementChatMessage[]>([]);
  const [participants, setParticipants] = React.useState<ChatParticipant[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  // Real-time connection state
  const [connectionState, setConnectionState] = React.useState<ChatConnectionState>("connecting");
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const isComponentMounted = React.useRef(true);

  // Form input state
  const [inputText, setInputText] = React.useState("");

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Helper to construct WebSocket URL
  const getWsUrl = React.useCallback(
    (ticket: string, conversation: ChatConversation) => {
      let wsProto = "ws:";
      let host = "localhost:8000";

      if (typeof window !== "undefined") {
        const isHttps = window.location.protocol === "https:";
        wsProto = isHttps ? "wss:" : "ws:";
        host = window.location.host;
      }

      if (env.apiUrl && (env.apiUrl.startsWith("http://") || env.apiUrl.startsWith("https://"))) {
        try {
          const parsed = new URL(env.apiUrl);
          wsProto = parsed.protocol === "https:" ? "wss:" : "ws:";
          host = parsed.host;
        } catch {
          // Fallback to window host
        }
      }

      return `${wsProto}//${host}/api/v1/engagements/${engagement.id}/ws?ticket=${encodeURIComponent(
        ticket
      )}&conversation=${conversation}`;
    },
    [engagement.id]
  );

  // Load chat messages: strictly fetches the ENTIRE message history for the specified conversation
  const fetchMessages = React.useCallback(
    async (targetConv: ChatConversation = activeTab) => {
      if (!currentOrganization?.id || !engagement.id) return;
      try {
        const endpoint = `${API_ENDPOINTS.engagements.messages(
          engagement.id
        )}?conversation=${targetConv}`;
        const res = await apiClient.get<EngagementChatMessage[]>(endpoint, {
          organizationId: currentOrganization.id,
        });

        if (Array.isArray(res)) {
          const setTargetMessages =
            targetConv === "internal" ? setTeamMessages : setClientMessages;
          setTargetMessages((prev) => {
            if (prev.length === 0) return res;
            const existingIds = new Set(res.map((m) => m.id));
            const existingClientMsgIds = new Set(
              res.filter((m) => m.client_msg_id).map((m) => m.client_msg_id)
            );
            // Keep optimistic messages that haven't shown up in REST yet
            const pendingOptimistic = prev.filter(
              (p) =>
                !existingIds.has(p.id) &&
                (!p.client_msg_id || !existingClientMsgIds.has(p.client_msg_id))
            );
            return [...res, ...pendingOptimistic];
          });
        }
      } catch {
        // Silently handle temporary network error
      }
    },
    [currentOrganization?.id, engagement.id, activeTab]
  );

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

  // Establish persistent WebSocket connection for the active conversation
  const connectWebSocket = React.useCallback(
    async (targetConv: ChatConversation = activeTab) => {
      if (!currentOrganization?.id || !engagement.id || !isOpen) return;

      // Clean up any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      try {
        setConnectionState("connecting");
        // 1. Obtain short-lived, single-use ticket from authenticated REST endpoint
        const ticketRes = await apiClient.post<WsTicketResponse>(
          `${API_ENDPOINTS.engagements.wsTicket(engagement.id)}?conversation=${targetConv}`,
          {},
          { organizationId: currentOrganization.id }
        );

        if (!ticketRes || !ticketRes.ticket) {
          console.warn("[ChatWS] Failed to obtain WebSocket ticket for engagement", engagement.id);
          setConnectionState("offline");
          return;
        }

        // 2. Open WebSocket connection
        const wsUrl = getWsUrl(ticketRes.ticket, targetConv);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isComponentMounted.current) return;
          console.info(
            `[ChatWS] WebSocket connection established for engagement ${engagement.id} [${targetConv}]`
          );
          setConnectionState("connected");

          // 3. Start 25s ping-pong heartbeat to prevent Render 100s idle proxy timeout
          const pId = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 25000);
          if (typeof (pId as unknown as { unref?: () => void }).unref === "function") {
            (pId as unknown as { unref: () => void }).unref();
          }
          pingIntervalRef.current = pId;
        };

        ws.onmessage = (event) => {
          if (!isComponentMounted.current) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "chat_message" && payload.data) {
              const incoming: EngagementChatMessage = payload.data;
              const incomingConv = incoming.visibility === "internal" ? "internal" : "client";
              console.info(
                `[ChatWS] Real-time message received via WebSocket (${incomingConv}):`,
                incoming.id
              );

              const updateMsgList = (prev: EngagementChatMessage[]) => {
                const matchIndex = prev.findIndex(
                  (m) =>
                    m.id === incoming.id ||
                    (m.client_msg_id &&
                      incoming.client_msg_id &&
                      m.client_msg_id === incoming.client_msg_id)
                );

                if (matchIndex !== -1) {
                  const updated = [...prev];
                  updated[matchIndex] = incoming;
                  return updated;
                }
                return [...prev, incoming];
              };

              if (incomingConv === "internal") {
                setTeamMessages(updateMsgList);
              } else {
                setClientMessages(updateMsgList);
              }
            } else if (payload.type === "error") {
              console.error("[ChatWS] WebSocket error received from backend:", payload.message);
            }
          } catch (err) {
            console.warn("[ChatWS] Failed to parse WebSocket frame:", err);
          }
        };

        ws.onclose = (event) => {
          if (!isComponentMounted.current) return;
          console.info(
            `[ChatWS] WebSocket closed for engagement ${engagement.id} [${targetConv}], code: ${event.code}`
          );
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          if (isOpen) {
            setConnectionState("reconnecting");
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isComponentMounted.current && isOpen) {
                console.info("[ChatWS] Reconnecting and synchronizing entire history...");
                connectWebSocket(targetConv);
                fetchMessages(targetConv);
              }
            }, 3000);
          } else {
            setConnectionState("offline");
          }
        };

        ws.onerror = () => {
          if (!isComponentMounted.current) return;
          console.warn("[ChatWS] WebSocket error occurred for engagement:", engagement.id);
          setConnectionState("reconnecting");
        };
      } catch (err) {
        console.warn("[ChatWS] Failed to initiate WebSocket connection:", err);
        if (isComponentMounted.current && isOpen) {
          setConnectionState("reconnecting");
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isComponentMounted.current && isOpen) {
              connectWebSocket(targetConv);
              fetchMessages(targetConv);
            }
          }, 3000);
        }
      }
    },
    [currentOrganization?.id, engagement.id, isOpen, getWsUrl, fetchMessages, activeTab]
  );

  // On open or activeTab switch: synchronize full history and reconnect WebSocket for active conversation
  React.useEffect(() => {
    isComponentMounted.current = true;
    if (isOpen) {
      setIsLoading(true);
      Promise.all([fetchMessages(activeTab), fetchParticipants()]).finally(() => {
        setIsLoading(false);
      });
      connectWebSocket(activeTab);
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      setConnectionState("offline");
    }

    return () => {
      isComponentMounted.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [isOpen, activeTab, fetchMessages, fetchParticipants, connectWebSocket]);

  const currentMessages = activeTab === "internal" ? teamMessages : clientMessages;

  // Auto scroll to bottom
  React.useEffect(() => {
    if (!isOpen || currentMessages.length === 0) return;
    const scrollTimeout = setTimeout(() => {
      if (typeof messagesEndRef.current?.scrollIntoView === "function") {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, 50);
    return () => clearTimeout(scrollTimeout);
  }, [currentMessages.length, isOpen, activeTab]);

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !currentOrganization?.id || isSending) return;

    setIsSending(true);
    const text = inputText.trim();
    const clientMsgId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Handle sender persona based on activeTab and testing perspective
    const isClientPerspective = isTestingAccount && testPerspective === "client";
    const senderType: "member" | "client" =
      isClientPerspective && activeTab === "client" ? "client" : "member";
    const senderName = isClientPerspective && activeTab === "client" ? "Client Contact" : "You";
    const senderRole =
      isClientPerspective && activeTab === "client"
        ? "Client Representative"
        : activeTab === "internal"
        ? "Team Member (Internal)"
        : "Team Member";

    const payload = {
      message: text,
      client_msg_id: clientMsgId,
      channel: "general" as const,
      visibility: activeTab,
      conversation: activeTab,
      sender_type: senderType,
      sender_name: isClientPerspective ? "Client Contact" : undefined,
      sender_role: isClientPerspective ? "Client Representative" : undefined,
    };

    // Optimistically display the message immediately
    const optimisticId = `temp-${clientMsgId}`;
    const optimisticMsg: EngagementChatMessage = {
      id: optimisticId,
      organization_id: currentOrganization.id,
      engagement_id: engagement.id,
      sender_name: senderName,
      sender_role: senderRole,
      sender_type: senderType,
      channel: "general",
      visibility: activeTab,
      message: text,
      client_msg_id: clientMsgId,
      created_at: new Date().toISOString(),
    };

    const setTargetMessages = activeTab === "internal" ? setTeamMessages : setClientMessages;
    setTargetMessages((prev) => [...prev, optimisticMsg]);
    setInputText("");

    try {
      // Prefer WebSocket transmission if socket is open
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.info(`[ChatWS] Sending chat_message over WebSocket [${activeTab}]:`, clientMsgId);
        wsRef.current.send(
          JSON.stringify({
            type: "chat_message",
            payload: payload,
          })
        );
      } else {
        // Fall back seamlessly to authenticated REST endpoint
        console.info(`[ChatWS] WebSocket not open, fallback REST [${activeTab}]:`, clientMsgId);
        const res = await apiClient.post<EngagementChatMessage>(
          API_ENDPOINTS.engagements.messages(engagement.id),
          payload,
          { organizationId: currentOrganization.id }
        );

        if (res && res.id) {
          setTargetMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticId || (m.client_msg_id && m.client_msg_id === clientMsgId)
                ? res
                : m
            )
          );
        }
      }
    } catch (err: unknown) {
      console.error("[ChatWS] Error sending message:", err);
      setTargetMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInputText(text);
      const msg = err instanceof Error ? err.message : "Failed to send message";
      alert(msg);
    } finally {
      setIsSending(false);
    }
  };

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
                  {/* Connection indicator */}
                  {connectionState === "connected" && (
                    <span
                      title="WebSocket connected (real-time active)"
                      className="inline-flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded-full border border-emerald-200 dark:border-emerald-800"
                    >
                      <Wifi className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />
                      Live
                    </span>
                  )}
                  {connectionState === "reconnecting" && (
                    <span
                      title="Reconnecting WebSocket..."
                      className="inline-flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded-full border border-amber-200 dark:border-amber-800"
                    >
                      <RefreshCw className="h-2.5 w-2.5 text-amber-500 animate-spin" />
                      Reconnecting
                    </span>
                  )}
                  {connectionState === "connecting" && (
                    <span
                      title="Connecting WebSocket..."
                      className="inline-flex items-center gap-1 text-[9px] text-slate-500 font-semibold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded-full"
                    >
                      Connecting
                    </span>
                  )}
                  {connectionState === "offline" && (
                    <span
                      title="WebSocket offline"
                      className="inline-flex items-center gap-1 text-[9px] text-rose-500 font-semibold bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.2 rounded-full border border-rose-200 dark:border-rose-800"
                    >
                      <WifiOff className="h-2.5 w-2.5 text-rose-500" />
                      Offline
                    </span>
                  )}
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
                  showParticipants
                    ? "bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    : "text-slate-600 dark:text-slate-400"
                }`}
                title="View Project Members and Client Contacts"
              >
                <Users className="h-3.5 w-3.5 text-primary-600" />
                <span className="text-[11px]">
                  {participants.length > 0 ? participants.length : "Team"}
                </span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  fetchMessages(activeTab);
                  if (connectionState !== "connected") {
                    connectWebSocket(activeTab);
                  }
                }}
                className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                title="Refresh entire message history and reconnect"
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

          {/* Testing Account Perspective Switcher (Only visible to verified testing account / owner) */}
          {isTestingAccount && (
            <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-3 py-1.5 text-[10px] dark:border-indigo-950 dark:bg-indigo-950/40">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                <UserCheck className="h-3 w-3 text-indigo-600" />
                Test View:
              </span>
              <div className="inline-flex rounded-lg bg-white/90 p-0.5 shadow-xs dark:bg-slate-900 border border-indigo-200/60 dark:border-indigo-900">
                <button
                  type="button"
                  onClick={() => setTestPerspective("member")}
                  className={`rounded-md px-2 py-0.5 font-medium transition-all ${
                    testPerspective === "member"
                      ? "bg-primary-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  title="Test as internal Team Member (has access to both Client Chat and Team Chat)"
                >
                  💻 Team Member
                </button>
                <button
                  type="button"
                  onClick={() => setTestPerspective("client")}
                  className={`rounded-md px-2 py-0.5 font-medium transition-all ${
                    testPerspective === "client"
                      ? "bg-emerald-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  title="Test as Client Contact (strictly Client Chat only, Team Chat hidden)"
                >
                  🏢 Client Contact
                </button>
              </div>
            </div>
          )}

          {/* Conversation Window Tabs: Client Chat vs Team Chat */}
          <div className="flex items-center border-b border-slate-200/80 bg-slate-100/70 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex w-full gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-900/80">
              <button
                type="button"
                onClick={() => setActiveTab("client")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  activeTab === "client"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
                title="Client Chat - Visible to project team and client contacts"
              >
                <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Client Chat</span>
              </button>

              {/* Team Chat Tab is strictly hidden from client contacts */}
              {canAccessTeamChat && (
                <button
                  type="button"
                  onClick={() => setActiveTab("internal")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    activeTab === "internal"
                      ? "bg-white text-purple-900 shadow-xs dark:bg-slate-800 dark:text-purple-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  title="Team Chat - Exclusively for internal project team discussions"
                >
                  <Lock className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Team Chat</span>
                </button>
              )}
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
                  <p className="text-[11px] text-slate-400 italic">No assigned team members</p>
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

              {/* Only show Client Stakeholders list in Client Chat or to internal users */}
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

          {/* Conversation Banner Header */}
          <div
            className={`px-3 py-1 text-[10px] font-medium flex items-center justify-between border-b ${
              activeTab === "internal"
                ? "bg-purple-50/80 text-purple-800 border-purple-200/70 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/60"
                : "bg-emerald-50/80 text-emerald-800 border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60"
            }`}
          >
            <div className="flex items-center gap-1">
              {activeTab === "internal" ? (
                <>
                  <ShieldCheck className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                  <span>Team Chat: Internal discussions (hidden from client)</span>
                </>
              ) : (
                <>
                  <Users className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Client Chat: Shared with project team & client</span>
                </>
              )}
            </div>
            <span className="text-[9px] opacity-75">{currentMessages.length} msgs</span>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50 dark:bg-slate-950/50">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Loading messages...
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-4">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center mb-2 ${
                    activeTab === "internal"
                      ? "bg-purple-50 text-purple-600 dark:bg-purple-950/50"
                      : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50"
                  }`}
                >
                  {activeTab === "internal" ? (
                    <Lock className="h-5 w-5" />
                  ) : (
                    <Sparkles className="h-5 w-5" />
                  )}
                </div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {activeTab === "internal" ? "Team Chat (Internal)" : "Client Chat"}
                </h4>
                <p className="mt-1 text-[11px] text-slate-500 max-w-[260px]">
                  {activeTab === "internal"
                    ? "Private channel for assigned project team members. Client contacts cannot view this conversation."
                    : "Shared conversation between project team members and client stakeholders."}
                </p>

                {/* Preset Suggestions */}
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {activeTab === "internal" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset(
                            "Internal update: Architecture review completed, proceeding with implementation."
                          )
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[10px] text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                      >
                        🔒 Internal progress note
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset("Checking blockers for today's deployment.")
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[10px] text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                      >
                        ⚡ Blocker check
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
                      <button
                        type="button"
                        onClick={() =>
                          handleInsertPreset(
                            "Checking in on current sprint progress and upcoming deliverables."
                          )
                        }
                        className="rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 text-[10px] text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                      >
                        💬 Sprint progress check
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              currentMessages.map((m) => {
                const isClient = m.sender_type === "client";
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col space-y-1 ${isClient ? "items-start" : "items-end"}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {m.sender_name}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-medium border ${
                          isClient
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                            : activeTab === "internal"
                            ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
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
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-xs leading-relaxed ${
                        isClient
                          ? "bg-white text-slate-800 border border-slate-200/80 rounded-tl-sm dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800"
                          : activeTab === "internal"
                          ? "bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-tr-sm"
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
                activeTab === "internal"
                  ? "Type internal team message (hidden from client)..."
                  : isTestingAccount && testPerspective === "client"
                  ? "Type message as client contact..."
                  : "Type message to client & team..."
              }
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!inputText.trim() || isSending}
              className={`h-8 w-8 rounded-xl p-0 text-white shrink-0 shadow-xs ${
                activeTab === "internal"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-primary-600 hover:bg-primary-700"
              }`}
              title="Send message (near real-time via WebSocket)"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
