import { createHmac, timingSafeEqual } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encode32(bytes) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map(b => alphabet[parseInt(b.padEnd(5, '0'), 2)]).join('');
}
export function decode32(secret) {
  if (!/^[A-Z2-7]+$/.test(secret)) throw new Error('Invalid OTP secret');
  const bits = [...secret].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)));
}
export function hotp(secret, counter, digits = 6) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decode32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}
export function verify(secret, code, lastCounter = -1, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1]) {
    if (counter <= lastCounter || counter < 0) continue;
    if (timingSafeEqual(Buffer.from(hotp(secret, counter)), Buffer.from(code))) return counter;
  }
  return null;
}

export function validateSnapshot(pr, snapshot, repository) {
  if (!snapshot || Date.now() - snapshot.created > 300000) throw new Error('검토 시간이 만료됐습니다. PR을 다시 불러오세요.');
  if (pr.state !== 'open' || pr.merged || pr.head.repo?.full_name !== repository ||
      pr.base.repo?.full_name !== repository || pr.head.sha !== snapshot.sha ||
      pr.base.ref !== snapshot.base || pr.base.sha !== snapshot.baseSha) {
    throw new Error('PR 상태 또는 코드가 바뀌었습니다. 다시 확인하고 승인하세요.');
  }
  if (pr.draft) throw new Error('GitHub에서 변경 내용을 확인하고 Ready for review로 전환한 뒤 다시 불러오세요.');
}
