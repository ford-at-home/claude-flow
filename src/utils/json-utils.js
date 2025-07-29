/**
 * JSON Utility Module
 * Provides safe JSON parsing and stringification with comprehensive error handling
 * 
 * @module json-utils
 */

// Simple logging functions to avoid log dependency issues
const log = {
  warn: (msg, data) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[json-utils] ${msg}`, data || '');
    }
  },
  error: (msg, data) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[json-utils] ${msg}`, data || '');
    }
  }
};

/**
 * Default options for JSON operations
 */
const DEFAULT_OPTIONS = {
  maxDepth: 100,
  maxSize: 10 * 1024 * 1024, // 10MB
  circularReplacement: '[Circular]',
  errorReplacement: '[Error]',
  undefinedReplacement: null,
  functionReplacement: '[Function]',
  bigIntReplacement: (n) => n.toString(),
  symbolReplacement: (s) => s.toString(),
};

/**
 * Safely parse JSON with comprehensive error handling
 * @param {string} str - JSON string to parse
 * @param {*} defaultValue - Default value to return on error
 * @param {Object} options - Parsing options
 * @returns {*} Parsed object or default value
 */
export function safeJsonParse(str, defaultValue = null, options = {}) {
  try {
    // Handle null, undefined, or empty strings
    if (str == null || str === '') {
      return defaultValue;
    }

    // Validate string type
    if (typeof str !== 'string') {
      log.warn('safeJsonParse called with non-string value', { type: typeof str });
      return defaultValue;
    }

    // Check size limits
    const maxSize = options.maxSize || DEFAULT_OPTIONS.maxSize;
    if (str.length > maxSize) {
      log.error('JSON string exceeds maximum size', { 
        size: str.length, 
        maxSize 
      });
      return defaultValue;
    }

    // Parse JSON
    const result = JSON.parse(str);
    
    return result;
  } catch (error) {
    log.error('JSON parse error', { 
      error: error.message,
      preview: str.substring(0, 100) + (str.length > 100 ? '...' : '')
    });
    return defaultValue;
  }
}

/**
 * Safely stringify JSON with circular reference handling
 * @param {*} obj - Object to stringify
 * @param {number} indent - Indentation spaces
 * @param {Object} options - Stringify options
 * @returns {string} JSON string or error representation
 */
export function safeJsonStringify(obj, indent = 0, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Handle null and undefined
    if (obj == null) {
      return JSON.stringify(null);
    }

    // Track seen objects for circular reference detection
    const seen = new WeakMap();
    const path = [];
    
    // Create a copy of the object with circular references replaced
    const replaceCycles = (obj, depth = 0) => {
      // Handle primitives and null
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }

      // Don't process special object types - let JSON.stringify handle them
      if (obj instanceof Date || obj instanceof Error || obj instanceof RegExp) {
        return obj;
      }

      // Check if we've seen this object before
      if (seen.has(obj)) {
        return opts.circularReplacement;
      }

      // Check depth
      if (depth > opts.maxDepth) {
        return '[Max Depth Exceeded]';
      }

      // Mark object as seen
      seen.set(obj, true);

      // Handle arrays
      if (Array.isArray(obj)) {
        const result = obj.map(item => replaceCycles(item, depth + 1));
        seen.delete(obj); // Remove from seen after processing
        return result;
      }

      // Handle regular objects
      const result = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = replaceCycles(obj[key], depth + 1);
        }
      }
      
      seen.delete(obj); // Remove from seen after processing
      return result;
    };

    // First pass: replace cycles
    const cleanedObj = replaceCycles(obj);

    // Second pass: handle special types with standard replacer
    const replacer = (key, value) => {
      // Handle special types
      if (value === undefined) {
        return opts.undefinedReplacement;
      }
      
      if (typeof value === 'function') {
        return opts.functionReplacement;
      }
      
      if (typeof value === 'bigint') {
        return typeof opts.bigIntReplacement === 'function' 
          ? opts.bigIntReplacement(value) 
          : value.toString();
      }
      
      if (typeof value === 'symbol') {
        return typeof opts.symbolReplacement === 'function'
          ? opts.symbolReplacement(value)
          : value.toString();
      }

      // Handle errors
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...(opts.includeErrorDetails ? value : {})
        };
      }

      return value;
    };

    const result = JSON.stringify(cleanedObj, replacer, indent);
    
    // Check result size
    if (result.length > opts.maxSize) {
      log.warn('JSON string output exceeds maximum size', {
        size: result.length,
        maxSize: opts.maxSize
      });
    }

    return result;
  } catch (error) {
    log.error('JSON stringify error', { 
      error: error.message,
      type: typeof obj
    });
    return JSON.stringify({
      error: 'Failed to stringify',
      message: error.message,
      type: typeof obj
    });
  }
}

/**
 * Deep clone an object using JSON (handles most cases except functions/symbols)
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object or null on error
 */
export function jsonClone(obj) {
  try {
    // Special handling for symbols that can't be cloned
    if (typeof obj === 'symbol') {
      return null;
    }
    const stringified = safeJsonStringify(obj);
    // If stringification resulted in a symbol string representation, return null
    if (typeof obj === 'symbol' && stringified.includes('Symbol(')) {
      return null;
    }
    return safeJsonParse(stringified);
  } catch (error) {
    log.error('JSON clone error', { error: error.message });
    return null;
  }
}

/**
 * Validate JSON string without parsing the entire object
 * @param {string} str - JSON string to validate
 * @returns {boolean} True if valid JSON
 */
export function isValidJson(str) {
  if (typeof str !== 'string') {
    return false;
  }

  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format JSON with proper indentation and sorting
 * @param {*} obj - Object to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted JSON string
 */
export function formatJson(obj, options = {}) {
  const {
    indent = 2,
    sortKeys = false,
    compact = false
  } = options;

  if (compact) {
    return safeJsonStringify(obj, 0);
  }

  if (sortKeys) {
    // Sort object keys recursively
    const sortObject = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(sortObject);
      }
      if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj)
          .sort()
          .reduce((sorted, key) => {
            sorted[key] = sortObject(obj[key]);
            return sorted;
          }, {});
      }
      return obj;
    };
    
    obj = sortObject(obj);
  }

  return safeJsonStringify(obj, indent);
}

/**
 * Merge JSON objects safely
 * @param {Object} target - Target object
 * @param {Object} source - Source object to merge
 * @param {Object} options - Merge options
 * @returns {Object} Merged object
 */
export function mergeJson(target, source, options = {}) {
  const {
    deep = true,
    arrayMerge = 'replace' // 'replace', 'concat', 'unique'
  } = options;

  if (!source || typeof source !== 'object') {
    return target;
  }

  const result = jsonClone(target) || {};

  const merge = (dst, src) => {
    for (const key in src) {
      if (src.hasOwnProperty(key)) {
        const srcVal = src[key];
        const dstVal = dst[key];

        if (deep && srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
          dst[key] = merge(dstVal || {}, srcVal);
        } else if (Array.isArray(srcVal)) {
          switch (arrayMerge) {
            case 'concat':
              dst[key] = (dstVal || []).concat(srcVal);
              break;
            case 'unique':
              dst[key] = [...new Set([...(dstVal || []), ...srcVal])];
              break;
            default: // 'replace'
              dst[key] = srcVal;
          }
        } else {
          dst[key] = srcVal;
        }
      }
    }
    return dst;
  };

  return merge(result, source);
}

/**
 * Extract JSON from text that may contain non-JSON content
 * @param {string} text - Text containing JSON
 * @returns {Object|null} Extracted JSON object or null
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Try to find JSON-like structures
  const patterns = [
    /\{[\s\S]*\}/,  // Object
    /\[[\s\S]*\]/   // Array
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const extracted = safeJsonParse(match[0]);
      if (extracted !== null) {
        return extracted;
      }
    }
  }

  // Try parsing the entire text
  return safeJsonParse(text, null);
}

// Export all functions
export default {
  safeJsonParse,
  safeJsonStringify,
  jsonClone,
  isValidJson,
  formatJson,
  mergeJson,
  extractJson,
  DEFAULT_OPTIONS
};