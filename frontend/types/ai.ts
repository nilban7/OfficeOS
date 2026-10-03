export interface AIConfiguration {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  provider: string;
  model_name: string;
  temperature: string | number;
  max_tokens_per_response: number;
  allowed_capabilities: string[];
  daily_request_limit: number;
  created_at: string;
  updated_at: string;
}

export interface AIConfigurationUpdate {
  is_enabled?: boolean;
  provider?: string;
  model_name?: string;
  temperature?: number;
  max_tokens_per_response?: number;
  allowed_capabilities?: string[];
  daily_request_limit?: number;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  sender_role: "user" | "assistant" | "system";
  content: string;
  capability_used?: string | null;
  tokens_used: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIConversation {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string | null;
}

export interface AIConversationDetail extends AIConversation {
  messages: AIMessage[];
}

export interface AIConversationCreate {
  title?: string;
  initial_message?: string;
}

export interface AIMessageCreate {
  content: string;
}

export interface AIQueryRequest {
  prompt: string;
  capability?: string;
}

export interface AIQueryResponse {
  response: string;
  capability_used?: string | null;
  tokens_used: number;
  data_context_summary?: Record<string, unknown>;
}
