// ============================================================================
// Merak — check whether an email has an ACTIVE Stripe subscription.
// Stripe itself is the source of truth (no database needed).
// GET /api/subscription-status?email=...
// Returns { active, status, plan, customer }.
// ============================================================================

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { res.status(500).json({ error: 'Stripe not configured.' }); return; }

  const email = (req.query.email || '').toString().trim().toLowerCase();
  if (!email) { res.status(200).json({ active: false }); return; }

  try {
    // 1) find the customer by email
    const cr = await fetch('https://api.stripe.com/v1/customers?limit=1&email=' + encodeURIComponent(email),
      { headers: { 'Authorization': 'Bearer ' + key } });
    const cd = await cr.json();
    const cust = cd.data && cd.data[0];
    if (!cust) { res.status(200).json({ active: false }); return; }

    // 2) list their subscriptions (all statuses) and look for an active/trialing one
    const sr = await fetch('https://api.stripe.com/v1/subscriptions?limit=10&status=all&customer=' + cust.id +
      '&expand[]=data.items.data.price', { headers: { 'Authorization': 'Bearer ' + key } });
    const sd = await sr.json();
    const sub = (sd.data || []).find(s => ['active', 'trialing', 'past_due'].includes(s.status));
    const interval = sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price &&
      sub.items.data[0].price.recurring && sub.items.data[0].price.recurring.interval;

    res.status(200).json({
      active: !!sub,
      status: sub ? sub.status : 'none',
      plan: sub ? (interval === 'year' ? 'yearly' : 'monthly') : null,
      current_period_end: sub ? sub.current_period_end : null,
      customer: cust.id,
    });
  } catch (e) {
    res.status(502).json({ error: String(e), active: false });
  }
}
