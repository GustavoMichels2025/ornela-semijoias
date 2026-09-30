const { json, methodNotAllowed } = require("./utils/response");
const { createAdminToken } = require("./utils/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  const adminPassword = process.env.ADMIN_PASSWORD || "ornela2026";

  try {
    const body = JSON.parse(event.body || "{}");

    if (body.password !== adminPassword) {
      return json(401, { error: "Senha inválida." });
    }

    return json(200, { token: createAdminToken() });
  } catch {
    return json(400, { error: "Requisição inválida." });
  }
};
