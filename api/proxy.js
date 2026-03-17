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
