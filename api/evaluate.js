export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const fetchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `次のURLの記事を取得し、タイトル・見出し・本文の主要テキストを抽出して返してください。URL: ${url}` }]
      })
    });
    const fetchData = await fetchRes.json();
    let pageText = (fetchData.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (pageText.length < 80) pageText = `URL: ${url}`;

    const evalRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: `あなたはLLMO・AIO専門家です。WebページをAI参照されやすさの観点で評価し、JSONのみ返してください。前後の説明・マークダウン記号は不要です。
形式: {"total_score":整数,"verdict":"15字以内","summary":"60字以内","axes":{"structure":{"score":整数,"comment":"40字以内"},"credibility":{"score":整数,"comment":"40字以内"},"depth":{"score":整数,"comment":"40字以内"},"citability":{"score":整数,"comment":"40字以内"},"eeat":{"score":整数,"comment":"40字以内"}},"improvements":["提案1","提案2","提案3"]}`,
        messages: [{ role: 'user', content: `以下を評価:\n\n${pageText.slice(0, 3000)}` }]
      })
    });

    const evalData = await evalRes.json();
    if (evalData.error) {
      return res.status(500).json({ error: evalData.error.message });
    }

    const raw = (evalData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'JSON not found in response: ' + raw.slice(0, 100) });
    }
    const result = JSON.parse(raw.slice(start, end + 1));
    res.status(200).json(result);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
