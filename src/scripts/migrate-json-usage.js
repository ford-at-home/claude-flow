#!/usr/bin/env node

/**
 * Migration script to update JSON.parse and JSON.stringify usage
 * to use the new safe JSON utilities
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

console.log(chalk.blue('🔧 JSON Usage Migration Script'));
console.log(chalk.yellow(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`));
console.log();

/**
 * Patterns to find and replace
 */
const REPLACEMENTS = [
  {
    name: 'JSON.parse without try-catch',
    pattern: /(?<!try\s*{[^}]*)\bJSON\.parse\s*\(/g,
    replacement: 'safeJsonParse(',
    importNeeded: 'safeJsonParse'
  },
  {
    name: 'JSON.stringify for logging/storage',
    pattern: /\bJSON\.stringify\s*\(/g,
    replacement: 'safeJsonStringify(',
    importNeeded: 'safeJsonStringify',
    // Don't replace in test files or where circular refs are explicitly handled
    skipPatterns: [/__tests__/, /\.test\./, /\.spec\./]
  },
  {
    name: 'parseJsonSafe to safeJsonParse',
    pattern: /\bparseJsonSafe\s*\(/g,
    replacement: 'safeJsonParse(',
    importNeeded: 'safeJsonParse'
  }
];

/**
 * Files to skip
 */
const SKIP_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/json-utils.js',  // Don't modify the utils file itself
  '**/json-utils.test.js',
  '**/migrate-json-usage.js'  // Don't modify this script
];

/**
 * Check if import statement exists
 */
function hasImport(content, importName) {
  const importRegex = new RegExp(`import\\s*{[^}]*${importName}[^}]*}\\s*from\\s*['"].*json-utils`);
  return importRegex.test(content);
}

/**
 * Add import statement
 */
function addImport(content, imports) {
  const importStatement = `import { ${imports.join(', ')} } from '../utils/json-utils.js';`;
  
  // Find the last import statement
  const importMatches = content.match(/^import\s+.*$/gm);
  if (importMatches) {
    const lastImport = importMatches[importMatches.length - 1];
    const lastImportIndex = content.lastIndexOf(lastImport);
    const insertIndex = lastImportIndex + lastImport.length;
    
    return (
      content.slice(0, insertIndex) +
      '\n' + importStatement +
      content.slice(insertIndex)
    );
  }
  
  // No imports found, add at the beginning
  return importStatement + '\n\n' + content;
}

/**
 * Calculate relative import path
 */
function getRelativeImportPath(fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  let relativePath = path.relative(fromDir, toFile);
  
  // Ensure forward slashes
  relativePath = relativePath.replace(/\\/g, '/');
  
  // Add ./ if needed
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  
  // Remove .js extension
  relativePath = relativePath.replace(/\.js$/, '');
  
  return relativePath;
}

/**
 * Process a single file
 */
async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    let modified = content;
    let changes = [];
    const neededImports = new Set();
    
    // Check if we should skip this file
    for (const skipPattern of SKIP_PATTERNS) {
      if (filePath.includes(skipPattern.replace(/\*/g, ''))) {
        return { skipped: true };
      }
    }
    
    // Apply replacements
    for (const replacement of REPLACEMENTS) {
      // Check skip patterns for this replacement
      if (replacement.skipPatterns?.some(pattern => pattern.test(filePath))) {
        continue;
      }
      
      const matches = [...content.matchAll(replacement.pattern)];
      if (matches.length > 0) {
        modified = modified.replace(replacement.pattern, replacement.replacement);
        neededImports.add(replacement.importNeeded);
        changes.push({
          type: replacement.name,
          count: matches.length
        });
      }
    }
    
    // Add imports if needed
    if (neededImports.size > 0) {
      const jsonUtilsPath = path.resolve('./src/utils/json-utils.js');
      const relativePath = getRelativeImportPath(filePath, jsonUtilsPath);
      
      const missingImports = [...neededImports].filter(imp => !hasImport(modified, imp));
      if (missingImports.length > 0) {
        const importStatement = `import { ${missingImports.join(', ')} } from '${relativePath}.js';`;
        
        // Find where to insert import
        const importMatches = modified.match(/^import\s+.*$/gm);
        if (importMatches) {
          const lastImport = importMatches[importMatches.length - 1];
          const lastImportIndex = modified.lastIndexOf(lastImport);
          const insertIndex = lastImportIndex + lastImport.length;
          
          modified = 
            modified.slice(0, insertIndex) +
            '\n' + importStatement +
            modified.slice(insertIndex);
        } else {
          // Check for shebang
          if (modified.startsWith('#!')) {
            const firstNewline = modified.indexOf('\n');
            modified = 
              modified.slice(0, firstNewline + 1) +
              '\n' + importStatement + '\n' +
              modified.slice(firstNewline + 1);
          } else {
            modified = importStatement + '\n\n' + modified;
          }
        }
        
        changes.push({
          type: 'Added import',
          count: 1
        });
      }
    }
    
    // Write changes if not dry run
    if (changes.length > 0) {
      if (!DRY_RUN) {
        await fs.writeFile(filePath, modified, 'utf8');
      }
      
      return { modified: true, changes };
    }
    
    return { modified: false };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    // Find all JavaScript/TypeScript files
    const files = await glob('src/**/*.{js,ts}', {
      ignore: SKIP_PATTERNS
    });
    
    console.log(chalk.cyan(`Found ${files.length} files to check\n`));
    
    const results = {
      modified: 0,
      skipped: 0,
      errors: 0,
      totalChanges: 0
    };
    
    // Process each file
    for (const file of files) {
      const result = await processFile(file);
      
      if (result.error) {
        results.errors++;
        console.log(chalk.red(`❌ Error in ${file}: ${result.error}`));
      } else if (result.skipped) {
        results.skipped++;
        if (VERBOSE) {
          console.log(chalk.gray(`⏭️  Skipped ${file}`));
        }
      } else if (result.modified) {
        results.modified++;
        results.totalChanges += result.changes.reduce((sum, c) => sum + c.count, 0);
        
        console.log(chalk.green(`✅ Modified ${file}`));
        if (VERBOSE) {
          result.changes.forEach(change => {
            console.log(chalk.gray(`   - ${change.type}: ${change.count} occurrences`));
          });
        }
      }
    }
    
    // Summary
    console.log('\n' + chalk.blue('Summary:'));
    console.log(chalk.green(`✅ Files modified: ${results.modified}`));
    console.log(chalk.yellow(`📝 Total changes: ${results.totalChanges}`));
    console.log(chalk.gray(`⏭️  Files skipped: ${results.skipped}`));
    if (results.errors > 0) {
      console.log(chalk.red(`❌ Errors: ${results.errors}`));
    }
    
    if (DRY_RUN) {
      console.log('\n' + chalk.yellow('This was a dry run. No files were actually modified.'));
      console.log(chalk.yellow('Run without --dry-run to apply changes.'));
    }
    
  } catch (error) {
    console.error(chalk.red('Migration failed:'), error);
    process.exit(1);
  }
}

// Run migration
migrate();