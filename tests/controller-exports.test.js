"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/round-controller.js");
require("../js/special-cards-controller.js");

assert.ok(Object.isFrozen(global.WizardRoundController));
assert.equal(typeof global.WizardRoundController.getRequiredElements, "function");
assert.ok(Object.isFrozen(global.WizardRoundController.createRoundController({})));
assert.ok(Object.isFrozen(global.WizardSpecialCardsController));
assert.equal(typeof global.WizardSpecialCardsController.getRequiredElements, "function");
assert.ok(Object.isFrozen(global.WizardSpecialCardsController.createSpecialCardsController({})));

delete global.window;

console.log("All controller-export tests passed.");
