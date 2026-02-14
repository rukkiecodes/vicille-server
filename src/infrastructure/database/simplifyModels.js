import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modulesDir = path.join(__dirname, '../../modules');

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

let fixed = 0;
walkDir(modulesDir, (filePath) => {
  if (!filePath.endsWith('.model.js')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const modelName = path.basename(filePath, '.model.js');

  // Remove all repository cache and getter functions
  content = content.replace(/let\s+\w+Repository\s*=\s*null;[\s\n]*/g, '');
  content = content.replace(/export\s+const\s+get\w+Repository\s*=[\s\S]*?};[\s\n]*/g, '');
  
  // Remove all remaining "async" method definitions that reference Repository
  // This is a aggressive but safe approach - remove everything before "const \w+Model = {"
  const modelDefMatch = content.match(/const\s+\w+Model\s*=\s*{/);
  if (modelDefMatch) {
    const keepFrom = content.indexOf(modelDefMatch[0]);
    content = content.substring(0, keepFrom) + content.substring(keepFrom);
  }

  // Ensure there's a proper export at the end
  if (!content.includes('export default')) {
    // Extract the model name from file
    const modelNameMatch = content.match(/const\s+(\w+Model)\s*=/);
    if (modelNameMatch) {
      const varName = modelNameMatch[1];
      if (!content.includes(`export default ${varName}`)) {
        content += `\n\nexport default ${varName};\n`;
      }
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${path.basename(filePath)}`);
    fixed++;
  }
});

console.log(`\n✅ Simplified ${fixed} model files!`);