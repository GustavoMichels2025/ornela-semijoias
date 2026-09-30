const { neon } = require('@neondatabase/serverless');

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Configure DATABASE_URL no Netlify.');
  return neon(url);
}

module.exports = { getSql };
