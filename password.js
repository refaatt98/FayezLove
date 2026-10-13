// تشفير كلمات المرور بـ scrypt المدمج في Node (أسرع بكثير من bcryptjs على خوادم الاستضافة المجانية)
// مع دعم كلمات المرور القديمة المحفوظة بـ bcrypt، وتُحدَّث تلقائيًا عند أول دخول ناجح.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, LEN = 64;

async function hash(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verify(pw, stored) {
  if (!stored) return false;
  if (stored.startsWith('$2')) return bcrypt.compare(pw, stored);
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(got, want);
}

const isLegacy = (stored) => typeof stored === 'string' && stored.startsWith('$2');
module.exports = { hash, verify, isLegacy };
