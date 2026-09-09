"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gemaskeerdeFout = exports.maskeerVerbindingssnoeren = exports.maskeer = exports.daysToRetain = exports.runDatabaseBackup = void 0;
var backup_js_1 = require("./backup.js");
Object.defineProperty(exports, "runDatabaseBackup", { enumerable: true, get: function () { return backup_js_1.runDatabaseBackup; } });
var retention_js_1 = require("./retention.js");
Object.defineProperty(exports, "daysToRetain", { enumerable: true, get: function () { return retention_js_1.daysToRetain; } });
// Exported so a consumer can mask its own logging around this package -- the
// connection string does not become harmless once it leaves here (TEN-86).
var redact_js_1 = require("./redact.js");
Object.defineProperty(exports, "maskeer", { enumerable: true, get: function () { return redact_js_1.maskeer; } });
Object.defineProperty(exports, "maskeerVerbindingssnoeren", { enumerable: true, get: function () { return redact_js_1.maskeerVerbindingssnoeren; } });
Object.defineProperty(exports, "gemaskeerdeFout", { enumerable: true, get: function () { return redact_js_1.gemaskeerdeFout; } });
