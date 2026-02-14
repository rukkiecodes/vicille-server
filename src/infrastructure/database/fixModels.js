import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modulesDir = path.join(__dirname, '../../modules');

// Function to walk through directory recursively
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return;
  }

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

// Fix each model file
let fixed = 0;
walkDir(modulesDir, (filePath) => {
  if (!filePath.endsWith('.model.js')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Remove all redis-om imports
  content = content.replace("import { Entity, Schema } from 'redis-om';\n", '');
  content = content.replace(/import\s*{\s*Entity\s*,\s*Schema\s*}\s*from\s*['"]redis-om['"];\n/g, '');

  // Replace getRedisOmClient import with getRedisClient
  content = content.replace(
    "import { getRedisOmClient } from '../../infrastructure/database/redis.js';",
    "import { getRedisClient } from '../../infrastructure/database/redis.js';"
  );
  
  // Handle different path levels
  content = content.replace(/import\s*{\s*getRedisOmClient\s*}\s*from\s*['"].*?redis\.js['"];/g,
    "import { getRedisClient } from '../../infrastructure/database/redis.js';"
  );

  // Replace getRedisOmClient() calls
  content = content.replace(/getRedisOmClient\s*\(/g, 'getRedisClient(');

  // Replace class X extends Entity with simpler structure
  content = content.replace(/class\s+(\w+)\s+extends\s+Entity\s*{/g, 'class $1 {');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${path.basename(filePath)}`);
    fixed++;
  }
});

console.log(`\n✅ Fixed ${fixed} model files!`);
