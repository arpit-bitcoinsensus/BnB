const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase using environment variables
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  // Shopify webhooks are POST requests
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const order = req.body;
    console.log(`[webhook] Received order update for ${order.name || order.id}`);

    // 1. Sync the Order to Supabase
    const { error: orderErr } = await supabase.from('orders').upsert({
      id: order.id,
      name: order.name,
      created_at: order.created_at,
      total_price: order.total_price,
      tags: order.tags,
      fulfillment_status: order.fulfillment_status,
      financial_status: order.financial_status,
      customer_fn: order.customer ? order.customer.first_name : null,
      customer_ln: order.customer ? order.customer.last_name : null
    }, { onConflict: 'id' });

    if (orderErr) {
      console.error('[webhook] Order upsert error:', orderErr);
      throw orderErr;
    }

    // 2. Sync Line Items to Supabase
    if (order.line_items && order.line_items.length > 0) {
      const itemsToInsert = order.line_items.map(li => ({
        id: li.id,
        order_id: order.id,
        product_id: li.product_id,
        variant_id: li.variant_id,
        title: li.title,
        quantity: li.quantity,
        price: li.price,
        sku: li.sku,
        created_at: order.created_at // Use order date for reporting consistency
      }));

      const { error: liErr } = await supabase.from('order_items').upsert(itemsToInsert, { onConflict: 'id' });
      if (liErr) {
        console.error('[webhook] Line items upsert error:', liErr);
        throw liErr;
      }
    }

    // Shopify expects a 200 OK response to acknowledge receipt
    res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook] Webhook failed:', err.message);
    // Even if it fails, we return 200/500 depending on if we want Shopify to retry
    // 500 will make Shopify retry later.
    res.status(500).send(`Internal Error: ${err.message}`);
  }
};
