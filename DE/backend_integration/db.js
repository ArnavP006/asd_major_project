// Connection pool (node-postgres).
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
    if (match) {
      let value = (match[2] || '').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[match[1]] = value;
    }
  }
  return env;
}

const fileEnv = {
  ...loadEnvFile(path.resolve(__dirname, '../.env')),
  ...loadEnvFile(path.resolve(__dirname, '.env')),
};

// Prioritize .env file, or clean environment variable (ignoring stale local 'museumx' exports)
const connectionString =
  fileEnv.DATABASE_URL ||
  (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('/museumx') ? process.env.DATABASE_URL : null);

const pool = new Pool({
  connectionString,
  max: 10,
});

module.exports = pool;
