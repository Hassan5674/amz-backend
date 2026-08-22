const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// ─── CORS ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));

// ─── YOUR CREDENTIALS (FINAL) ───────────────────────────
// Using the keys you provided.
// If you prefer to use Render environment variables, replace these with process.env...
const API_KEY = '42T21GY-P6D4QMW-NSMAV55-MDHNY0F';
const IPN_SECRET = 'PluBAuPAVfhGGm/PL4JdTd0cAUSAJzQd';
const API_URL = 'https://api.nowpayments.io/v1';     // LIVE, not sandbox
const WEBHOOK_URL = 'https://amz-backend-6isd.onrender.com/api/webhook';

// ─── CURRENCY MAP ──────────────────────────────────────
const currencyMap = {
  'USDT': {
    'ERC20': 'usdterc20',
    'BEP20': 'usdtbep20',
    'TRC20': 'usdttrc20',
    'SOL': 'usdtsol',
  },
  'USDC': {
    'ERC20': 'usdcerc20',
    'BEP20': 'usdcbep20',
    'SOL': 'usdcsol',
  },
  'BTC': { 'BTC': 'btc' },
  'ETH': { 'ERC20': 'eth' },
  'SOL': { 'SOL': 'sol' },
};

// ─── CREATE PAYMENT ──────────────────────────────────
app.post('/api/create-payment', async (req, res) => {
  const { amount, currency, network } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const payCurrency = currencyMap[currency]?.[network];
  if (!payCurrency) {
    return res.status(400).json({ error: 'Unsupported currency/network combination' });
  }

  try {
    const response = await axios.post(
      `${API_URL}/payment`,
      {
        price_amount: parseFloat(amount),
        price_currency: 'usd',
        pay_currency: payCurrency,
        order_id: `ORDER-${Date.now()}`,
        ipn_callback_url: WEBHOOK_URL,
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const { payment_id, pay_address, pay_amount, price_amount, price_currency } = response.data;

    res.json({
      success: true,
      paymentId: payment_id,
      address: pay_address,
      amount: pay_amount,
      currency: payCurrency,
      fiatAmount: price_amount,
      fiatCurrency: price_currency,
    });
  } catch (error) {
    console.error('❌ NOWPayments error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Payment creation failed',
      details: error.response?.data?.message || error.message,
    });
  }
});

// ─── WEBHOOK ──────────────────────────────────────────
app.post('/api/webhook', (req, res) => {
  const payload = req.body;
  const signature = req.headers['x-nowpayments-sig'];

  const computed = crypto
    .createHmac('sha512', IPN_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  if (computed !== signature) {
    console.error('❌ Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }

  console.log('✅ Webhook received:', payload);

  const { payment_status, order_id, price_amount } = payload;

  if (payment_status === 'confirmed') {
    console.log(`💰 Payment confirmed for ${order_id}: $${price_amount}`);
    // 🎯 Here you would credit the user's balance in your database
  } else {
    console.log(`ℹ️ Payment status: ${payment_status} for ${order_id}`);
  }

  res.status(200).send('SUCCESS');
});

// ─── HEALTH CHECK ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── START SERVER ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Webhook URL: ${WEBHOOK_URL}`);
});
