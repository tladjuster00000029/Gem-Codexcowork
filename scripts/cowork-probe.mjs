import { gemini } from './cowork-api.mjs';

try {
  await gemini('연결 확인 시험입니다. 연결됨이라는 한 단어만 답하세요.');
  console.log('Gemini generation succeeded with the selected model.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
