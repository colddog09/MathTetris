const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("SUPABASE_URL / SUPABASE_ANON_KEY 환경변수가 없습니다. Vercel 프로젝트 설정 -> Environment Variables 에 등록하세요.");
  process.exit(1);
}

const outPath = path.join(__dirname, "..", "js", "supabase-config.js");
const content = `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};\n`;
fs.writeFileSync(outPath, content);
console.log(`supabase-config.js generated at ${outPath}`);
