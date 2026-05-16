# 📊 Shopify Analytics Dashboard

A self-hostable, real-time Shopify analytics dashboard with AI-powered insights, deployed on Vercel with Supabase as the database.

---

## 🗂️ Project Structure

```
├── shopify-dashboard.html   # Main frontend (single-file app — all UI, logic, charts)
├── api/
│   ├── config.js            # Serverless: exposes Supabase config to frontend
│   ├── proxy.js             # Serverless: Shopify API proxy + AI Insights/Chat (Gemini)
│   └── webhook.js           # Serverless: Shopify webhook → syncs orders to Supabase
├── db/
│   └── supabase_schema.sql  # Run this in your Supabase SQL editor to set up tables
├── proxy.js                 # Local dev server (mirrors api/proxy.js for localhost)
├── vercel.json              # Vercel routing config
├── package.json             # Node.js dependencies
└── .env.example             # Environment variable template (copy to .env for local dev)
```

---

## ⚡ Quick Setup

### 1. Clone & Install

```bash
git clone <this-repo-url>
cd <project-folder>
npm install
```

### 2. Set Up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `db/supabase_schema.sql`
3. Note your **Project URL** and **anon/public key** from `Settings → API`

> The schema creates a `product_pricing` table used to store cost price, selling price, and shipping charges per SKU — essential for net profit calculations.

### 3. Set Up Shopify App

You need a **Custom App** in your Shopify store or a **Partner App**:

**Option A — Admin API Token (legacy, easiest):**
- Shopify Admin → Settings → Apps & Sales Channels → Develop Apps
- Create app → Configure API scopes (see below) → Generate token (`shpat_...`)
- Use this token directly as `SHOPIFY_CLIENT_SECRET`; leave `SHOPIFY_CLIENT_ID` blank

**Option B — Partner App with Client Credentials (newer, `shpss_` tokens):**
- Shopify Partners → Apps → Create App → Get Client ID + Client Secret (`shpss_...`)
- Set both `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` in your env

**Required Shopify API Scopes:**
```
read_orders, read_products, read_inventory, read_customers
```

### 4. Get Gemini API Key

- Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Create a key and save it as `GEMINI_API_KEY`

### 5. Configure Environment Variables

```bash
cp .env.example .env
# Fill in your values in .env
```

---

## 🚀 Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Then add all variables from `.env.example` in:  
**Vercel Dashboard → Your Project → Settings → Environment Variables**

> ⚠️ Never commit your `.env` file. It is already in `.gitignore`.

---

## 💻 Run Locally

```bash
node proxy.js
# Open shopify-dashboard.html in a browser
# OR open http://localhost:3000
```

---

## 🔗 Shopify Webhook (Optional but Recommended)

For real-time order sync, register a webhook in Shopify:

- **Topic:** `orders/updated`
- **URL:** `https://your-vercel-deployment.vercel.app/webhook`

This ensures orders land in Supabase automatically as they happen.

---

## 🧠 Key Features

| Feature | Description |
|---|---|
| **Daily Dashboard** | Revenue, orders, net profit, ad spend — all in one view |
| **PNL per Product** | Per-product profit breakdown with cost price, shipping, ad allocation |
| **AI Insights** | Powered by Gemini 2.5 Flash — strategic Do's & Don'ts analysis |
| **AI Chat** | Natural-language Q&A about your store metrics |
| **Customer Retention** | Tracks repeat vs first-time buyer ratio |
| **Product Pricing Manager** | Edit cost price / selling price / shipping per SKU inline |
| **Supabase Sync** | Orders and line items persisted for fast historical queries |

---

## 🗃️ Database Schema

### `product_pricing` (created via `db/supabase_schema.sql`)

| Column | Type | Description |
|---|---|---|
| `sku` | TEXT (PK) | Shopify variant SKU |
| `product_title` | TEXT | Product name |
| `cost_price` | DECIMAL | Cost of goods |
| `selling_price` | DECIMAL | Selling price |
| `shipping_charge` | DECIMAL | Per-unit logistics cost |
| `updated_at` | TIMESTAMP | Last updated |

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/config` | GET | Returns Supabase URL + anon key to the frontend |
| `/shopify-api/*` | GET | Proxies any Shopify Admin REST API call |
| `/api/ai-insights` | POST | Generates AI analysis via Gemini |
| `/api/ai-chat` | POST | Handles conversational AI Q&A |
| `/webhook` | POST | Receives Shopify order webhooks |

---

## 🔧 Customization Tips

- **Brand name / store name**: Search for `"BnB"` in `shopify-dashboard.html` and replace with your brand
- **Currency symbol**: Search for `₹` in `shopify-dashboard.html` and replace with your currency
- **Ad spend**: The dashboard has a manual ad spend input per day — this data is stored locally in `localStorage`
- **Default cost price**: In `db/supabase_schema.sql`, change `DEFAULT 555` for `cost_price` to your typical COGS

---

## ⚙️ Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase public anon key |
| `SHOPIFY_STORE_URL` | ✅ | e.g. `your-brand.myshopify.com` |
| `SHOPIFY_CLIENT_SECRET` | ✅ | Admin token (`shpat_`) or client secret (`shpss_`) |
| `SHOPIFY_CLIENT_ID` | Only for `shpss_` tokens | Shopify Partner App Client ID |
| `GEMINI_API_KEY` | For AI features | Google AI Studio key |
