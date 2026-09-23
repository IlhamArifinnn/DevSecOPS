// Simulasi notifikasi Midtrans (untuk PAYMENT_MOCK=true).
// Pakai: node --env-file=.env src/simulate-webhook.js <ORDER_CODE> <total> [settlement|expire|deny]
const crypto = require('node:crypto');

const [code, total, status = 'settlement'] = process.argv.slice(2);
if (!code || !total) { console.error('Usage: simulate-webhook.js <ORDER_CODE> <total> [status]'); process.exit(1); }

const gross = Number(total).toFixed(2);
const statusCode = status === 'settlement' ? '200' : '202';
const body = {
  order_id: code, status_code: statusCode, gross_amount: gross, transaction_status: status,
  signature_key: crypto.createHash('sha512')
    .update(`${code}${statusCode}${gross}${process.env.MIDTRANS_SERVER_KEY}`).digest('hex'),
};

fetch(`http://localhost:${process.env.PORT || 3000}/api/payments/webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async (r) => console.log(r.status, await r.text()));
