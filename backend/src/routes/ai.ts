import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiredAuthMiddleware } from '../middleware/auth';

const aiProxySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama']),
  model: z.string(),
  messages: z.array(z.any()),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  systemPrompt: z.string().optional(),
});

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.post('/ai/chat', {
    onRequest: [requiredAuthMiddleware],
    handler: async (request, reply) => {
      console.log('🤖 AI 代理接收到请求:', request.body);
      try {
        const body = aiProxySchema.parse(request.body);
        const { provider, model, messages, apiKey, baseUrl, systemPrompt } = body;

        // Map internal 'system' role to 'assistant' for the LLM history
        const messagesMapped = messages.map((m: any) => ({
          role: m.role === 'system' ? 'assistant' : m.role,
          content: m.content,
        }));

        let endpoint = baseUrl;
        let headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        let fetchPayload: any = {
          model,
          temperature: 0.7,
        };

        if (provider === 'openai') {
          endpoint = endpoint || 'https://api.openai.com/v1/chat/completions';
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
          fetchPayload.messages = [{ role: 'system', content: systemPrompt }, ...messagesMapped];
          fetchPayload.stream = true;
        } else if (provider === 'anthropic') {
          // Anthropic 协议处理
          endpoint = baseUrl || 'https://api.anthropic.com/v1/messages';

          // 如果 baseUrl 没有包含完整的 /v1/messages 路径,自动补充
          if (!endpoint.includes('/v1/messages')) {
            endpoint = endpoint.replace(/\/$/, '') + '/v1/messages';
          }

          console.log('📡 Anthropic 请求 URL:', endpoint);

          if (apiKey) headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          fetchPayload.system = systemPrompt;
          fetchPayload.messages = messagesMapped;
          fetchPayload.max_tokens = 4096;
          fetchPayload.stream = true;
        } else if (provider === 'ollama') {
          endpoint = endpoint || 'http://localhost:11434/api/chat';
          fetchPayload.messages = [{ role: 'system', content: systemPrompt }, ...messagesMapped];
          fetchPayload.stream = true;
        }

        const response = await fetch(endpoint!, {
          method: 'POST',
          headers,
          body: JSON.stringify(fetchPayload),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`❌ AI API 返回错误 [${response.status}]:`, errText);
          return reply.code(response.status).send({ error: errText });
        }

        // 设置 SSE 响应头和 CORS
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('Access-Control-Allow-Origin', 'http://localhost:3300');
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');

        // 流式传输响应
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          return reply.code(500).send({ error: 'No response body' });
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            reply.raw.write(`data: ${chunk}\n\n`);
          }
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        } catch (streamError) {
          console.error('Stream error:', streamError);
          reply.raw.end();
        }
      } catch (error) {
        console.error('AI Proxy Error:', error);
        return reply.code(500).send({ error: (error as Error).message });
      }
    },
  });
}
