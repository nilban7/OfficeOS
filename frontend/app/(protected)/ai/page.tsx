"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Settings,
  Sparkles,
  ShieldAlert,
  Loader2,
  MessageSquare,
  Users,
  Clock,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ROUTES } from "@/constants/routes";
import type {
  AIConversation,
  AIConversationDetail,
  AIMessage,
  AIConfiguration,
} from "@/types/ai";

export default function AIAssistantPage() {
  const { currentOrganization, permissions } = useOrganization();

  const canViewAI = permissions.includes("ai.view") || permissions.includes("ai.use") || permissions.includes("ai.manage");
  const canUseAI = permissions.includes("ai.use") || permissions.includes("ai.manage");
  const canManageAI = permissions.includes("ai.manage");

  const [conversations, setConversations] = React.useState<AIConversation[]>([]);
  const [activeConversation, setActiveConversation] = React.useState<AIConversationDetail | null>(null);
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
  const [config, setConfig] = React.useState<AIConfiguration | null>(null);

  const [inputPrompt, setInputPrompt] = React.useState("");
  const [isLoadingList, setIsLoadingList] = React.useState(true);
  const [isLoadingConv, setIsLoadingConv] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages]);

  // Load config & conversation list
  React.useEffect(() => {
    if (!currentOrganization || !canViewAI) {
      setIsLoadingList(false);
      return;
    }

    let isMounted = true;

    async function loadData() {
      setIsLoadingList(true);
      setErrorMessage(null);
      try {
        const [configRes, convsRes] = await Promise.all([
          apiClient.get<AIConfiguration>(API_ENDPOINTS.ai.configuration),
          apiClient.get<AIConversation[]>(API_ENDPOINTS.ai.conversations),
        ]);

        if (!isMounted) return;

        if (configRes) {
          setConfig(configRes);
        }

        const list = convsRes || [];
        setConversations(list);

        const first = list[0];
        if (first && !activeConvId) {
          loadConversation(first.id);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load AI conversations";
        setErrorMessage(msg);
      } finally {
        if (isMounted) {
          setIsLoadingList(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganization, canViewAI]);

  async function loadConversation(id: string) {
    setActiveConvId(id);
    setIsLoadingConv(true);
    try {
      const res = await apiClient.get<AIConversationDetail>(API_ENDPOINTS.ai.conversationDetail(id));
      if (res) {
        setActiveConversation(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load conversation details";
      setErrorMessage(msg);
    } finally {
      setIsLoadingConv(false);
    }
  }

  async function handleStartNewChat(initialPrompt?: string) {
    if (!canUseAI) return;
    setIsSending(true);
    setErrorMessage(null);
    try {
      const payload = {
        title: initialPrompt ? initialPrompt.slice(0, 40) + "..." : "New Analysis",
        initial_message: initialPrompt || undefined,
      };
      const res = await apiClient.post<AIConversationDetail>(API_ENDPOINTS.ai.conversations, payload);
      if (res) {
        const newConv = res;
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversation(newConv);
        setActiveConvId(newConv.id);
        setInputPrompt("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start conversation";
      setErrorMessage(msg);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const prompt = inputPrompt.trim();
    if (!prompt || isSending || !canUseAI) return;

    if (!activeConvId) {
      await handleStartNewChat(prompt);
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setInputPrompt("");

    // Optimistic user message
    const optimisticUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId,
      sender_role: "user",
      content: prompt,
      tokens_used: prompt.split(" ").length,
      metadata: {},
      created_at: new Date().toISOString(),
    };

    setActiveConversation((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        messages: [...prev.messages, optimisticUserMsg],
      };
    });

    try {
      const res = await apiClient.post<AIConversationDetail>(
        API_ENDPOINTS.ai.messages(activeConvId),
        { content: prompt }
      );
      if (res) {
        setActiveConversation(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      setErrorMessage(msg);
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await apiClient.delete(API_ENDPOINTS.ai.conversationDetail(id));
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConversation(null);
        setActiveConvId(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete conversation";
      setErrorMessage(msg);
    }
  }

  if (!canViewAI) {
    return (
      <div className="mx-auto max-w-4xl py-12 px-4 sm:px-6">
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="pt-6 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-rose-600 mx-auto" />
            <h2 className="text-lg font-bold text-rose-900">Access Restricted</h2>
            <p className="text-sm text-rose-700 max-w-md mx-auto">
              You do not have permission to access the OfficeOS AI Assistant. Contact your organization administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const quickPrompts = [
    { label: "Workforce & Headcount", prompt: "Who are our active employees and what departments are they in?", icon: Users },
    { label: "Pending Leaves", prompt: "Show all pending leave requests with employee names and requested days.", icon: Clock },
    { label: "Active Projects & Budgets", prompt: "List our active projects, progress status, and allocated budgets.", icon: Briefcase },
    { label: "Operational Tasks", prompt: "What are our open or overdue operation tasks and their priorities?", icon: Sparkles },
  ];

  const providerLabel = config?.provider === "groq" ? "Groq LPU" : "Gemini";
  const modelLabel = config?.model_name ?? (config?.provider === "groq" ? "llama-3.3-70b-versatile" : "gemini-1.5-flash");

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">OfficeOS AI Assistant</h1>
              <Badge variant="outline" className="text-[11px] font-medium border-slate-200 bg-slate-50 text-slate-700">
                {providerLabel} · {modelLabel}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Live database-level intelligence powered by {providerLabel} ({modelLabel})
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {config?.is_enabled === false && (
            <Badge variant="destructive" className="text-xs">
              AI Disabled for Org
            </Badge>
          )}
          {canManageAI && (
            <Link href={ROUTES.SETTINGS_AI}>
              <Button size="sm" variant="outline" className="flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5 text-slate-500" />
                <span>AI Settings</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-210px)] min-h-[500px]">
        {/* Left Sidebar: Conversations */}
        <div className="md:col-span-1 flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm h-full">
          <Button
            size="sm"
            onClick={() => handleStartNewChat()}
            disabled={isSending || !canUseAI}
            className="w-full justify-start gap-2 mb-3 bg-primary-600 hover:bg-primary-700 text-white"
          >
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </Button>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-2 py-1">
            Conversations
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {isLoadingList ? (
              <div className="flex items-center justify-center py-8 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading sessions...
              </div>
            ) : conversations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No conversations yet</div>
            ) : (
              conversations.map((c) => {
                const isActive = activeConvId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    className={`group flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                      isActive
                        ? "bg-primary-50 text-primary-900 font-medium"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      <span className="truncate">{c.title}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(e, c.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Chat Window */}
        <div className="md:col-span-3 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden h-full">
          {/* Active Chat Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center space-x-2 truncate">
              <Sparkles className="h-4 w-4 text-primary-600 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-800 truncate">
                {activeConversation?.title ?? "AI Conversation"}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
              <Badge variant="outline" className="text-[10px] font-normal border-slate-200">
                Tenant Scoped
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal border-slate-200">
                Permission Aware
              </Badge>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {errorMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {isLoadingConv ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading messages...
              </div>
            ) : !activeConversation || activeConversation.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto py-12 space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center shadow-inner">
                  <Bot className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">How can I help with your office operations?</h3>
                  <p className="text-xs text-slate-500">
                    Ask me about employees, leaves, attendance records, active projects, maintenance, or financials.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 w-full pt-2">
                  {quickPrompts.map((qp, i) => {
                    const Icon = qp.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => handleStartNewChat(qp.prompt)}
                        disabled={isSending || !canUseAI}
                        className="flex items-center space-x-2.5 text-left p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-slate-100/80 transition-colors text-xs text-slate-700 font-medium"
                      >
                        <Icon className="h-4 w-4 text-primary-600 flex-shrink-0" />
                        <span className="truncate">{qp.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              activeConversation.messages.map((m) => {
                const isUser = m.sender_role === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white flex-shrink-0 mt-0.5">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`rounded-xl p-3.5 text-xs max-w-[85%] leading-relaxed ${
                        isUser
                          ? "bg-primary-600 text-white rounded-tr-none shadow-sm"
                          : "bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none whitespace-pre-wrap shadow-sm"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex items-start gap-2.5 justify-start">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white flex-shrink-0 mt-0.5">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-xl p-3 text-xs bg-slate-50 border border-slate-200 text-slate-500 rounded-tl-none flex items-center space-x-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing organizational data...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <div className="p-3 border-t border-slate-200 bg-white">
            <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
              <Input
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder={canUseAI ? "Ask OfficeOS Assistant..." : "You lack permission to query AI"}
                disabled={isSending || !canUseAI}
                className="flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isSending || !inputPrompt.trim() || !canUseAI}
                className="bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1.5"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Send</span>
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
