"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.daysToRetain = exports.runDatabaseBackup = void 0;
var backup_js_1 = require("./backup.js");
Object.defineProperty(exports, "runDatabaseBackup", { enumerable: true, get: function () { return backup_js_1.runDatabaseBackup; } });
var retention_js_1 = require("./retention.js");
Object.defineProperty(exports, "daysToRetain", { enumerable: true, get: function () { return retention_js_1.daysToRetain; } });
