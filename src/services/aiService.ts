import { ChatMessage } from '../../types';
import { useAIStore } from '../stores/aiStore';
import { fetchWithAuth } from './authFetch';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

export async function callLLM(
  messages: ChatMessage[],
  onChunk?: (text: string) => void
): Promise<string> {
  const { settings } = useAIStore.getState();

  const history = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const response = await fetchWithAuth(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: settings.provider,
        model: settings.model,
        messages: history,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        systemPrompt: settings.systemPrompt,
      }),
    });

    if (!response.ok) {
      let errorDetail = `AI Request Failed: ${response.status}`;
      try {
        const errJson = await response.json();
        errorDetail = errJson.error ? JSON.stringify(errJson.error) : JSON.stringify(errJson);
      } catch (_e) {
        const text = await response.text().catch(() => '');
        if (text) errorDetail += ` - ${text}`;
      }
      throw new Error(errorDetail);
    }

    // 处理流式响应
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    if (!reader) {
      throw new Error('Response body is null');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            let textChunk = '';

            // OpenAI 流式格式
            if (parsed.choices?.[0]?.delta?.content) {
              textChunk = parsed.choices[0].delta.content;
            }
            // Anthropic 流式格式
            else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              textChunk = parsed.delta.text;
            }
            // Ollama 流式格式
            else if (parsed.message?.content) {
              textChunk = parsed.message.content;
            }

            if (textChunk) {
              fullText += textChunk;
              onChunk?.(textChunk);
            }
          } catch (_e) {
            // 忽略无法解析的行
          }
        }
      }
    }

    return fullText || 'AI 返回内容为空';
  } catch (error) {
    console.error('LLM Request Failed:', error);
    throw error;
  }
}
