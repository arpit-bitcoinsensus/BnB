const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// In-memory token cache: { storeUrl: { accessToken, expiresAt } }
const tokenCache = {};

async function getAccessToken(storeUrl, clientId, clientSecret) {
  const now = Date.now();
  const cached = tokenCache[storeUrl];
  // Use cached token if still valid (with 60s buffer)
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
  const expiresIn = data.expires_in || 86399; // default 24h
  tokenCache[storeUrl] = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn * 1000
  };

  console.log(`[proxy] Got access token. Expires in ${expiresIn}s`);
  return data.access_token;
}

// Main proxy endpoint
app.get('/shopify-api/*path', async (req, res) => {
  const storeUrl = req.headers['x-shopify-store-url'];
  const clientId = req.headers['x-shopify-client-id'];
  const clientSecret = req.headers['x-shopify-access-token']; // dashboard sends the secret here

  if (!storeUrl || !clientSecret) {
    return res.status(400).json({ error: 'Missing x-shopify-store-url or x-shopify-access-token headers' });
  }

  try {
    // If the token starts with shpat_, it's already a real access token - use directly
    // If it starts with shpss_, it's a client secret - exchange for token first
    let accessToken = clientSecret;
    if (clientSecret.startsWith('shpss_') || clientSecret.startsWith('shpat_') === false) {
      if (!clientId) {
        return res.status(400).json({ error: 'Missing x-shopify-client-id header for secret exchange' });
      }
      accessToken = await getAccessToken(storeUrl, clientId, clientSecret);
    }

    // Build the target Shopify API URL
    const shopifyPath = req.path.replace('/shopify-api', '');
    const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = `https://${storeUrl}${shopifyPath}${queryString ? '?' + queryString : ''}`;

    console.log(`[proxy] → ${targetUrl}`);

    const shopifyResp = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    const body = await shopifyResp.json();

    if (!shopifyResp.ok) {
      console.error(`[proxy] Shopify error ${shopifyResp.status}:`, body);
      return res.status(shopifyResp.status).json(body);
    }

    res.status(200).json(body);
  } catch (err) {
    console.error('[proxy] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

if (process.env.VERCEL) {
  // Export the app for Vercel Serverless Functions
  module.exports = app;
} else {
  // Run locally on port 3000
  app.listen(PORT, () => {
    console.log(`Shopify Proxy running on http://localhost:${PORT}`);
    console.log(`Handles automatic OAuth token exchange for shpss_ secrets`);
  });
}
