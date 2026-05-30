/**
 * sync-dataset.js
 * 
 * Copies generated datasets from data-pipeline/data/output 
 * to public/data for the PWA to consume.
 * 
 * Usage: node scripts/sync-dataset.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data-pipeline', 'data', 'output');
const TARGET_DIR = path.join(ROOT, 'public', 'data');

const FILES_TO_COPY = [
  'hyd_risk_zones.db',
  'hyd_risk_zones.geojson.gz',
  'manifest.json',
];

const CITY_DIRS = ['hyd'];

function copyFile(src, dest) {
  const data = fs.readFileSync(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
  const sizeMB = (data.length / 1024 / 1024).toFixed(2);
  console.log(`  ✓ ${path.basename(src)} (${sizeMB} MB)`);
}

function syncDatasets() {
  console.log('🔄 Syncing datasets from data-pipeline to public/data...\n');
  
  for (const cityDir of CITY_DIRS) {
    console.log(`📁 City: ${cityDir.toUpperCase()}`);
    
    const sourceDir = path.join(SOURCE_DIR, cityDir);
    const targetDir = path.join(TARGET_DIR, cityDir);
    
    if (!fs.existsSync(sourceDir)) {
      console.log(`  ⚠ Source not found: ${sourceDir}`);
      continue;
    }
    
    for (const file of FILES_TO_COPY) {
      const src = path.join(sourceDir, file);
      const dest = path.join(targetDir, file);
      
      if (fs.existsSync(src)) {
        copyFile(src, dest);
      } else {
        console.log(`  ⚠ Missing: ${file}`);
      }
    }
    console.log();
  }
  
  console.log('✅ Dataset sync complete');
}

syncDatasets();