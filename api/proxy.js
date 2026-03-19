const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Shopify credentials — must be set as environment variables in Vercel
// (See Vercel Dashboard → Project → Settings → Environment Variables)
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// AI Insights endpoint
app.post('/api/ai-insights', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
    }

    const { metrics, period } = req.body;

    const prompt = `
      You are a world-class E-commerce Business Analyst for "BnB Toys".
      Analyze these store metrics and product performance for the period: ${period}
      
      FINANCIAL METRICS:
      - Gross Revenue (Delivered): ₹${metrics.rev}
      - Total Orders: ${metrics.orders} (Delivered: ${metrics.delivered})
      - Advertising Spend: ₹${metrics.ad}
      - Total Product Cost (CP): ₹${metrics.productCost}
      - Total Logistics/Shipping Cost: ₹${metrics.logisticsCost}
      - ESTIMATED NET PROFIT: ₹${metrics.netProfit}
      - Customer Retention Rate: ${metrics.retention}%
      
      TOP PRODUCTS PERFORMANCE:
      ${metrics.topProducts.map(p => `- ${p.title}: Sold ${p.sold}, Revenue ₹${p.rev}`).join('\n')}
      
      TASK:
      Provide a highly strategic, data-driven analysis.
      1. Give a 1-sentence executive summary focused on profitability and efficiency.
      2. Provide 3 specific "Strategic Do's" (Focus on scaling winners, improving margins, or optimizing ad spend).
      3. Provide 3 specific "Strategic Don'ts" (Address high costs, low margins, or retention gaps).
      
      SPECIAL FOCUS: 
      - If Net Profit is low relative to Revenue, analyze why (Logistics? Product Cost? Ad Spend?).
      - Provide advice for specific products listed in the performance section.
      
      FORMAT: Return JSON exactly like this:
      {
        "summary": "...",
        "dos": ["...", "...", "..."],
        "donts": ["...", "...", "..."]
      }
    `;

    console.log(`[proxy] Requesting AI insights for period: ${period}...`);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    if (!geminiResp.ok) {
      const err = await geminiResp.text();
      throw new Error(`Gemini API failed: ${err}`);
    }

    const result = await geminiResp.json();
    const aiText = result.candidates[0].content.parts[0].text;
    res.json(JSON.parse(aiText));

  } catch (err) {
    console.error('[AI Proxy Error]:', err.message);
    res.status(500).json({ error: 'AI Analysis failed: ' + err.message });
  }
});

// In-memory token cache
const tokenCache = {};

async function getAccessToken(storeUrl, clientId, clientSecret) {
  const now = Date.now();
  const cached = tokenCache[storeUrl];
  if (cached && cached.expiresAt > now + 60000) {
    return cached.accessToken;
  }

  console.log(`[proxy] Fetching new access token for ${storeUrl}...`);
  const resp = await fetch(`https://${storeUrl}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const expiresIn = data.expires_in || 86399;
  tokenCache[storeUrl] = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn * 1000
  };

  console.log(`[proxy] Got access token. Expires in ${expiresIn}s`);
  return data.access_token;
}

// Main proxy endpoint — credentials come from server env, not request headers
app.get('/shopify-api/*path', async (req, res) => {
  try {
    if (!SHOPIFY_STORE_URL || !SHOPIFY_CLIENT_SECRET) {
      return res.status(500).json({
        error: 'Missing Shopify credentials. Please set SHOPIFY_STORE_URL and SHOPIFY_CLIENT_SECRET in environment variables.'
      });
    }

    let accessToken = SHOPIFY_CLIENT_SECRET;

    // If it's a client secret (shpss_), exchange for access token using client_credentials
    if (SHOPIFY_CLIENT_SECRET.startsWith('shpss_')) {
      if (!SHOPIFY_CLIENT_ID) {
        return res.status(500).json({ error: 'SHOPIFY_CLIENT_ID env var is required for shpss_ secret exchange' });
      }
      accessToken = await getAccessToken(SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET);
    }

    // Build the target Shopify API URL
    const shopifyPath = req.path.replace('/shopify-api', '');
    const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = `https://${SHOPIFY_STORE_URL}${shopifyPath}${queryString ? '?' + queryString : ''}`;

    console.log(`[proxy] → ${targetUrl}`);

    const shopifyResp = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    const body = await shopifyResp.json();
    const linkHeader = shopifyResp.headers.get('Link');

    if (!shopifyResp.ok) {
      console.error(`[proxy] Shopify error ${shopifyResp.status}:`, body);
      return res.status(shopifyResp.status).json(body);
    }

    if (linkHeader) {
      body.pagination = { link: linkHeader };
    }

    res.status(200).json(body);
  } catch (err) {
    console.error('[proxy] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Shopify Proxy running on http://localhost:${PORT}`);
  });
}
