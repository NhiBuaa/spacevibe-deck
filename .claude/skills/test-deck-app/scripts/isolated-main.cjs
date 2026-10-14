// Playwright launch target: point userData at a scratch dir, then load Deck's main process.
const { app } = require("electron");
const path = require("node:path");

const { DECK_TEST_USERDATA, DECK_TEST_MAIN } = process.env;
if (!DECK_TEST_USERDATA || !DECK_TEST_MAIN) {
  console.error("isolated-main: set DECK_TEST_USERDATA and DECK_TEST_MAIN");
  app.exit(2);
} else {
  // Before main loads: it reads userData while initialising.
  app.setPath("userData", path.resolve(DECK_TEST_USERDATA));
  require(path.resolve(DECK_TEST_MAIN));
}
