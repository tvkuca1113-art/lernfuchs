// ============================================================================
// Merak — open the Stripe Billing Portal so a user can manage / cancel their
// subscription and update payment details. Returns { url } to redirect to.
// GET /api/portal?email=...
// (Enable the portal once in Stripe: Settings → Billing → Customer portal.)
// ============================================================================

export default async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { res.status(500).json({ error: 'Stripe not configured.' }); return; }

  const email = (req.query.email || '').toString().trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'email required' }); return; }
  const origin = req.headers.origin || ('https://' + req.headers.host);

  try {
    const cr = await fetch('https://api.stripe.com/v1/customers?limit=1&email=' + encodeURIComponent(email),
      { headers: { 'Authorization': 'Bearer ' + key } });
    const cd = await cr.json();
    const cust = cd.data && cd.data[0];
    if (!cust) { res.status(404).json({ error: 'no customer for that email' }); return; }

    const params = new URLSearchParams();
    params.append('customer', cust.id);
    params.append('return_url', origin + '/');
    const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: (data.error && data.error.message) || 'Stripe error' }); return; }
    res.status(200).json({ url: data.url });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
