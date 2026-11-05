import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const themes = ['burgundy', 'deep_navy', 'forest_green'];
export function validatePost(post, { publish = false } = {}) {
  const errors = [];
  const text = (value, path, limit) => {
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${path}: 비어 있거나 문자열이 아닙니다`);
      return;
    }
    for (const line of value.split('\n')) {
      if (limit && [...line].length > limit) errors.push(`${path}: ${[...line].length}자 > ${limit}자`);
    }
  };
  const lines = (value, path, limit, count) => {
    if (!Array.isArray(value) || !value.length || (count && value.length !== count)) {
      errors.push(`${path}: ${count || '1개 이상'} 문자열 배열 필요`);
      return;
    }
    value.forEach((line, i) => {
      if (line === '') return; // Existing renderer supports blank paragraph separators.
      text(line, `${path}[${i}]`, limit);
    });
  };
  if (!post || typeof post !== 'object' || Array.isArray(post)) return ['JSON 객체 필요'];
  text(post.topic, 'topic');
  if (!themes.includes(post.theme_color)) errors.push('theme_color: burgundy / deep_navy / forest_green 필요');
  text(post.brunch_url, 'brunch_url');
  if (publish && !/^https:\/\/brunch\.co\.kr\/@tl-oooooo\/\d+$/.test(post.brunch_url)) {
    errors.push('brunch_url: 발행된 글 번호 필요');
  }
  const cover = post.cards?.slide1;
  text(cover?.main_title, 'slide1.main_title', 15);
  text(cover?.sub_title, 'slide1.sub_title', 18);
  lines(cover?.left_caption, 'slide1.left_caption', 18, 3);
  const middle = post.cards?.slides_2_to_4;
  if (!Array.isArray(middle) || middle.length !== 3) errors.push('slides_2_to_4: 카드 3개 필요');
  const cards = [...(Array.isArray(middle) ? middle : []), post.cards?.slide5];
  cards.forEach((card, i) => {
    const path = `slide${i + 2}`;
    text(card?.title, `${path}.title`, 24);
    text(card?.headline, `${path}.headline`, 25);
    lines(card?.bullets, `${path}.bullets`, 28);
    if (i < 3) text(card?.note, `${path}.note`, 28);
    else lines(card?.green_notes, `${path}.green_notes`, 28);
  });
  text(post.instagram?.caption, 'instagram.caption');
  text(post.threads?.main_text, 'threads.main_text');
  text(post.threads?.reply_text, 'threads.reply_text');
  for (const [path, value, min, max] of [
    ['instagram.caption', post.instagram?.caption, 11, 15],
    ['threads.reply_text', post.threads?.reply_text, 5, 5],
  ]) {
    const count = typeof value === 'string' ? (value.match(/#[\p{L}\p{N}_]+/gu) || []).length : 0;
    if (count < min || count > max) errors.push(`${path}: 해시태그 ${count}개, ${min}~${max}개 필요`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const errors = validatePost(JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '')), {
      publish: process.argv.includes('--publish'),
    });
    console.log(JSON.stringify({ passed: errors.length === 0, errors }, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
