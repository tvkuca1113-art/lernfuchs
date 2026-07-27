// ============================================================================
// Merak — create a Stripe Checkout Session (subscription, 7-day free trial).
// Zero npm dependencies: talks to the Stripe REST API directly with fetch.
//
// SETUP (Vercel → Project → Settings → Environment Variables):
//   STRIPE_SECRET_KEY     = sk_test_... (or sk_live_...)
//   STRIPE_PRICE_MONTHLY  = price_...   (your monthly recurring Price ID)
//   STRIPE_PRICE_YEARLY   = price_...   (your yearly recurring Price ID)
// See STRIPE-SETUP.md for the step-by-step.
// ============================================================================

export default async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { res.status(500).json({ error: 'Stripe not configured (STRIPE_SECRET_KEY missing).' }); return; }

  // read plan + email from JSON body (POST) or query
  let plan = 'monthly', email = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    plan = (body.plan || req.query.plan || 'monthly');
    email = (body.email || req.query.email || '').toString().trim();
  } catch (e) { plan = req.query.plan || 'monthly'; email = (req.query.email || '').toString(); }

  const priceId = plan === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
  if (!priceId) { res.status(500).json({ error: 'Missing price ID env var for plan "' + plan + '".' }); return; }

  const origin = req.headers.origin || ('https://' + req.headers.host);

  // Reuse an existing Stripe customer for this email (avoids duplicate
  // customers on resubscribe and keeps status/portal lookups reliable).
  // Falls back to customer_email when none exists yet.
  let customerId = '';
  if (email) {
    try {
      const cr = await fetch('https://api.stripe.com/v1/customers?limit=1&email=' + encodeURIComponent(email),
        { headers: { 'Authorization': 'Bearer ' + key } });
      const cd = await cr.json();
      customerId = (cd.data && cd.data[0] && cd.data[0].id) || '';
    } catch (e) { /* non-fatal — fall back to customer_email below */ }
  }

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('subscription_data[trial_period_days]', '7');
  params.append('allow_promotion_codes', 'true');
  params.append('success_url', origin + '/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  params.append('cancel_url', origin + '/?checkout=cancel');
  if (customerId) params.append('customer', customerId);
  else if (email) params.append('customer_email', email);

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: (data.error && data.error.message) || 'Stripe error' }); return; }
    res.status(200).json({ url: data.url, id: data.id });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
