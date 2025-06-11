const fs = require("fs");
const path = require("path");

const rootPackagePath = path.resolve(__dirname, "..", "package.json");
const distDir = path.resolve(__dirname, "..", "lib");
const distPackagePath = path.join(distDir, "package.json");

const packageJson = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));

// Update fields
packageJson.main = "index.js";
packageJson.types = "index.d.ts";
delete packageJson.private;

// and remove unnecessary fields
delete packageJson["scripts"];
delete packageJson["devDependencies"];
delete packageJson["eslintConfig"];
delete packageJson["prettier"];
delete packageJson["lint-staged"];
delete packageJson["jupyterlab"];

fs.writeFileSync(distPackagePath, JSON.stringify(packageJson, null, 2), "utf8");
