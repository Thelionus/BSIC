const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an AI assistant for BSIC Bénin (Banque Sahélo-Saharienne pour l'Investissement et le Commerce), a bank operating in Benin, West Africa.

Your role is to help customers with questions about:
- Opening bank accounts (savings, checking, business)
- Loan products (personal loans, mortgages, business loans, EasyCredit)
- Account requirements and documentation
- Branch locations (Cotonou - Siège, Porto-Novo, Parakou)
- Banking hours and contact information
- Online banking and mobile services
- Transfer and payment services
- Card services (debit/credit cards)
- Interest rates and fees (provide general guidance; refer to branch for exact figures)
- Application process for banking products

Important guidelines:
- Respond primarily in French (the official language of Benin), unless the user writes in another language
- Be polite, professional, and helpful — typical of a bank customer service representative
- For complex financial decisions or exact rates, always recommend the customer visit or call their nearest BSIC branch
- Keep answers concise and clear
- If asked about something outside banking/BSIC services, politely redirect to banking topics
- Never make up specific account numbers, loan approvals, or commitments on behalf of the bank

BSIC Bénin contact info:
- Siège: Cotonou, Avenue Jean-Paul II
- Phone: +229 21 31 24 00
- Website: www.bsic.bj`;

// Chat endpoint with streaming
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages are required' });
  }

  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Claude API error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Une erreur est survenue. Veuillez réessayer.' })}\n\n`);
    res.end();
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BSIC Chatbot server running on http://localhost:${PORT}`);
  console.log(`Set ANTHROPIC_API_KEY environment variable before starting.`);
});
