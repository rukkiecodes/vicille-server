import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modulesDir = path.join(__dirname, '../../modules');

// Function to walk through directory recursively
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else {
      callback(filePath);
    }
  });
}

// Fix each model file - strip out redis-om schema definitions
let fixed = 0;
walkDir(modulesDir, (filePath) => {
  if (!filePath.endsWith('.model.js')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Match and remove the class definition and schema (between class definition and comment ending the schema)
  //This is destructive so we only remove Schema-related definitions
  
  // Remove: const tailorSchema = new Schema(Tailor, { ... }); patterns
  // Match from "const *Schema = new Schema(" until "});" (with multi-line support)
  content = content.replace(/const\s+\w+Schema\s*=\s*new\s+Schema\s*\([^;]*?}\s*,\s*{\s*dataStructure:\s*['"]JSON['"]\s*}\s*\);/gs, '// Schema definition removed for Redis compatibility\n');
  
  // Remove remaining Schema definitions
  content = content.replace(/const\s+\w+Schema\s*=\s*new\s+Schema\s*\([^;]*?\);\s*/gs, '// Schema definition removed\n');

  // Remove Repository-related code
  content = content.replace(/let\s+\w+Repository\s*=\s*null;[\s\S]*?export\s+const\s+get\w+Repository[\s\S]*?return\s+\w+Repository;[\s\S]*?};[\s\n]*/g, '');

  // Replace remaining getRedisOmClient() calls
  content = content.replace(/getRedisOmClient\(\)/g, 'getRedisClient()');
  content = content.replace(/await\s+getRedisClient\(\)/g, 'getRedisClient()');

  // Keep track of changes
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${path.basename(filePath)}`);
    fixed++;
  }
});

console.log(`\n✅ Cleaned ${fixed} model files!`);