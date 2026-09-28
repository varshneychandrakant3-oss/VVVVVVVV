/*
 * Payment service.
 *
 * Mirrors a real gateway flow (Razorpay / Cashfree Payments):
 *   1. createOrder   — the backend creates an order for the exact amount
 *   2. checkout      — the gateway's hosted checkout collects UPI / card / net banking
 *                      (card data never touches VanYatra code)
 *   3. verify        — the backend checks the gateway's signature before confirming
 *
 * This demo implementation simulates all three in the browser, including failed
 * and cancelled payments. To go live, replace these three functions with calls to
 * backend endpoints that talk to the gateway (see README → "Payments").
 */
window.App = window.App || {};
(() => {
  const h = (...a) => App.h(...a);
  // Deterministic stand-in for the gateway's HMAC signature
  const sign = (orderId, paymentId) => 'demo_sig_' + App.hashPassword(orderId + '|' + paymentId).split('$')[1];
  const METHOD_LABEL = { upi: 'UPI', card: 'Card •• 4242', netbanking: 'Net banking' };

  App.payments = {
    provider: 'demo',

    async createOrder({ amount, currency = App.C.currency, receipt, notes = {} }) {
      if (!(amount > 0)) throw new Error('Invalid amount.');
      await new Promise(r => setTimeout(r, 250));
      return { id: 'order_demo_' + Math.random().toString(36).slice(2, 12), amount: Math.round(amount), currency, receipt, notes, createdAt: new Date().toISOString() };
    },

    // Resolves { status: 'paid', paymentId, signature, method, label } | { status: 'failed', reason } | { status: 'cancelled' }
    async checkout(order, { method, description }) {
      const choice = await App.modal({
        title: 'Secure checkout (demo)',
        body: h`<div class="gateway">
          <p class="small muted">In production this is the payment gateway’s hosted checkout (UPI collect, cards with 3-D Secure, net banking). No real payment details are taken here.</p>
          <div class="gw-amount"><span>${description || 'Amount'}</span><strong>${App.money(order.amount)}</strong></div>
          <div class="gw-method">${method === 'upi' ? '📱 Approve the request in your UPI app' : method === 'card' ? '💳 Card entered on the gateway’s secure page, verified with 3-D Secure OTP' : '🏦 Redirect to your bank to approve'}</div>
          <p class="small muted">Order ${order.id}</p>
        </div>`,
        actions: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Simulate failed payment', value: 'fail' },
          { label: 'Simulate successful payment', primary: true, value: 'pay' }
        ]
      });
      if (!choice || choice === 'cancel') return { status: 'cancelled' };
      await new Promise(r => setTimeout(r, 500));
      if (choice === 'fail') return { status: 'failed', reason: method === 'upi' ? 'The UPI request was declined in your app.' : method === 'card' ? 'Your bank declined the card (3-D Secure failed).' : 'Your bank didn’t confirm the payment.' };
      const paymentId = 'pay_demo_' + Math.random().toString(36).slice(2, 12);
      return { status: 'paid', paymentId, signature: sign(order.id, paymentId), method, label: METHOD_LABEL[method] || method };
    },

    // A real backend recomputes the gateway HMAC with its secret; never trust the browser alone
    async verify(order, payment) {
      await new Promise(r => setTimeout(r, 200));
      return payment.status === 'paid' && payment.signature === sign(order.id, payment.paymentId);
    }
  };
})();
