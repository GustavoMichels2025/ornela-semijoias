function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function methodNotAllowed() {
  return json(405, { error: "Método não permitido." });
}

module.exports = { json, methodNotAllowed };
