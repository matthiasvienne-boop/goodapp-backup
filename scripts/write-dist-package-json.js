// Marks dist/cjs and dist/esm with their own module type so Node doesn't have
// to guess (avoids the dual-package-hazard ambiguity when both builds sit
// under the same package root).
const fs = require("fs");
const path = require("path");

function write(dir, type) {
  const target = path.join(__dirname, "..", dir, "package.json");
  fs.writeFileSync(target, JSON.stringify({ type }, null, 2) + "\n");
}

write("dist/cjs", "commonjs");
write("dist/esm", "module");
