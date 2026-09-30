const crypto = require("crypto");

function secret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || "ornela-token-dev";
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret())
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;

  const [encoded, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", secret())
    .update(encoded)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function createAdminToken() {
  return sign({
    role: "admin",
    exp: Date.now() + 1000 * 60 * 60 * 12
  });
}

function requireAdmin(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = verify(token);
  return payload?.role === "admin";
}

module.exports = { createAdminToken, requireAdmin };
