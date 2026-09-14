// Wordt uitsluitend naar de tijdelijke testserver gekopieerd.
routerAdd("GET", "/api/test/ready", (e) => e.json(200, { token: $os.getenv("KELDER_TEST_TOKEN") }));
routerAdd("POST", "/api/test/run", (e) => {
  if (
    !$os.getenv("KELDER_TEST_TOKEN") ||
    e.request.header.get("X-Test-Token") !== $os.getenv("KELDER_TEST_TOKEN")
  )
    return e.json(403, { message: "Alleen de eigen teststarter." });
  const scenario = require(`${__hooks}/scenario.js`);
  return e.json(200, scenario.run(e.app));
});
