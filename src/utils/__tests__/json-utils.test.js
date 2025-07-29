/**
 * Tests for JSON Utility Module
 */

import { jest } from '@jest/globals';
import {
  safeJsonParse,
  safeJsonStringify,
  jsonClone,
  isValidJson,
  formatJson,
  mergeJson,
  extractJson
} from '../json-utils.js';

// Set test environment to suppress console logs
beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  delete process.env.NODE_ENV;
});

describe('JSON Utils', () => {
  describe('safeJsonParse', () => {
    test('should parse valid JSON', () => {
      expect(safeJsonParse('{"key": "value"}')).toEqual({ key: 'value' });
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(safeJsonParse('"string"')).toBe('string');
      expect(safeJsonParse('123')).toBe(123);
      expect(safeJsonParse('true')).toBe(true);
      expect(safeJsonParse('null')).toBe(null);
    });

    test('should return default value for invalid JSON', () => {
      expect(safeJsonParse('invalid', 'default')).toBe('default');
      expect(safeJsonParse('{invalid}', {})).toEqual({});
      expect(safeJsonParse('', [])).toEqual([]);
      expect(safeJsonParse(null, 'default')).toBe('default');
      expect(safeJsonParse(undefined, 'default')).toBe('default');
    });

    test('should handle non-string inputs', () => {
      expect(safeJsonParse(123, 'default')).toBe('default');
      expect(safeJsonParse({}, 'default')).toBe('default');
      expect(safeJsonParse([], 'default')).toBe('default');
    });

    test('should respect size limits', () => {
      const largeString = '{' + '"a":"' + 'x'.repeat(11 * 1024 * 1024) + '"}';
      expect(safeJsonParse(largeString, 'too-large')).toBe('too-large');
    });
  });

  describe('safeJsonStringify', () => {
    test('should stringify basic values', () => {
      expect(safeJsonStringify({ key: 'value' })).toBe('{"key":"value"}');
      expect(safeJsonStringify([1, 2, 3])).toBe('[1,2,3]');
      expect(safeJsonStringify('string')).toBe('"string"');
      expect(safeJsonStringify(123)).toBe('123');
      expect(safeJsonStringify(true)).toBe('true');
      expect(safeJsonStringify(null)).toBe('null');
    });

    test('should handle circular references', () => {
      const obj = { a: 1 };
      obj.circular = obj;
      const result = safeJsonStringify(obj);
      expect(result).toContain('[Circular]');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('should handle special types', () => {
      const obj = {
        func: () => {},
        undef: undefined,
        bigInt: BigInt(123),
        symbol: Symbol('test'),
        error: new Error('test error')
      };
      const result = safeJsonStringify(obj);
      const parsed = JSON.parse(result);
      
      expect(parsed.func).toBe('[Function]');
      expect(parsed.undef).toBe(null);
      expect(parsed.bigInt).toBe('123');
      expect(parsed.symbol).toContain('Symbol(test)');
      expect(parsed.error).toHaveProperty('message', 'test error');
      expect(parsed.error).toHaveProperty('name', 'Error');
    });

    test('should handle indentation', () => {
      const obj = { a: 1, b: { c: 2 } };
      const result = safeJsonStringify(obj, 2);
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });

    test('should handle max depth', () => {
      const createDeepObject = (depth) => {
        let obj = { value: 'deep' };
        for (let i = 0; i < depth; i++) {
          obj = { nested: obj };
        }
        return obj;
      };
      
      const deepObj = createDeepObject(150);
      const result = safeJsonStringify(deepObj, 0, { maxDepth: 50 });
      expect(result).toContain('[Max Depth Exceeded]');
    });
  });

  describe('jsonClone', () => {
    test('should clone simple objects', () => {
      const original = { a: 1, b: 'two', c: [3, 4] };
      const cloned = jsonClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.c).not.toBe(original.c);
    });

    test('should handle circular references', () => {
      const obj = { a: 1 };
      obj.circular = obj;
      const cloned = jsonClone(obj);
      
      expect(cloned).toBeTruthy();
      expect(cloned.a).toBe(1);
      expect(cloned.circular).toBe('[Circular]');
    });

    test('should return null for non-cloneable objects', () => {
      expect(jsonClone(undefined)).toBe(null);
      expect(jsonClone(Symbol('test'))).toBe(null);
    });
  });

  describe('isValidJson', () => {
    test('should validate correct JSON strings', () => {
      expect(isValidJson('{"valid": true}')).toBe(true);
      expect(isValidJson('[]')).toBe(true);
      expect(isValidJson('"string"')).toBe(true);
      expect(isValidJson('123')).toBe(true);
      expect(isValidJson('null')).toBe(true);
    });

    test('should reject invalid JSON', () => {
      expect(isValidJson('{invalid}')).toBe(false);
      expect(isValidJson('undefined')).toBe(false);
      expect(isValidJson('')).toBe(false);
      expect(isValidJson('{a:1}')).toBe(false);
      expect(isValidJson("{'a':1}")).toBe(false);
    });

    test('should reject non-string inputs', () => {
      expect(isValidJson(123)).toBe(false);
      expect(isValidJson({})).toBe(false);
      expect(isValidJson(null)).toBe(false);
      expect(isValidJson(undefined)).toBe(false);
    });
  });

  describe('formatJson', () => {
    test('should format with default indentation', () => {
      const obj = { a: 1, b: { c: 2 } };
      const formatted = formatJson(obj);
      
      expect(formatted).toContain('\n');
      expect(formatted).toContain('  ');
      expect(JSON.parse(formatted)).toEqual(obj);
    });

    test('should sort keys when requested', () => {
      const obj = { z: 1, a: 2, m: 3 };
      const formatted = formatJson(obj, { sortKeys: true });
      
      const lines = formatted.split('\n');
      const aIndex = lines.findIndex(l => l.includes('"a"'));
      const mIndex = lines.findIndex(l => l.includes('"m"'));
      const zIndex = lines.findIndex(l => l.includes('"z"'));
      
      expect(aIndex).toBeLessThan(mIndex);
      expect(mIndex).toBeLessThan(zIndex);
    });

    test('should support compact mode', () => {
      const obj = { a: 1, b: { c: 2 } };
      const formatted = formatJson(obj, { compact: true });
      
      expect(formatted).not.toContain('\n');
      expect(formatted).toBe('{"a":1,"b":{"c":2}}');
    });
  });

  describe('mergeJson', () => {
    test('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = mergeJson(target, source);
      
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
      expect(target).toEqual({ a: 1, b: 2 }); // Original unchanged
    });

    test('should deep merge nested objects', () => {
      const target = { a: { b: 1, c: 2 } };
      const source = { a: { c: 3, d: 4 } };
      const result = mergeJson(target, source);
      
      expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
    });

    test('should handle array merge strategies', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4] };
      
      // Replace (default)
      expect(mergeJson(target, source)).toEqual({ arr: [3, 4] });
      
      // Concat
      expect(mergeJson(target, source, { arrayMerge: 'concat' }))
        .toEqual({ arr: [1, 2, 3, 4] });
      
      // Unique
      const target2 = { arr: [1, 2, 3] };
      const source2 = { arr: [2, 3, 4] };
      expect(mergeJson(target2, source2, { arrayMerge: 'unique' }))
        .toEqual({ arr: [1, 2, 3, 4] });
    });

    test('should handle invalid inputs', () => {
      expect(mergeJson({ a: 1 }, null)).toEqual({ a: 1 });
      expect(mergeJson({ a: 1 }, 'string')).toEqual({ a: 1 });
      expect(mergeJson(null, { a: 1 })).toEqual({ a: 1 });
    });
  });

  describe('extractJson', () => {
    test('should extract JSON from mixed content', () => {
      const text = 'Some text before {"key": "value"} and after';
      expect(extractJson(text)).toEqual({ key: 'value' });
    });

    test('should extract arrays', () => {
      const text = 'Array: [1, 2, 3] in text';
      expect(extractJson(text)).toEqual([1, 2, 3]);
    });

    test('should prefer objects over arrays', () => {
      const text = '[1, 2] and {"key": "value"}';
      expect(extractJson(text)).toEqual({ key: 'value' });
    });

    test('should handle pure JSON strings', () => {
      expect(extractJson('{"pure": "json"}')).toEqual({ pure: 'json' });
    });

    test('should return null for no JSON', () => {
      expect(extractJson('no json here')).toBe(null);
      expect(extractJson('')).toBe(null);
      expect(extractJson(null)).toBe(null);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle deeply nested circular references', () => {
      const obj = { level1: { level2: {} } };
      obj.level1.level2.circular = obj.level1;
      
      const stringified = safeJsonStringify(obj);
      expect(stringified).toContain('[Circular]');
      expect(() => JSON.parse(stringified)).not.toThrow();
    });

    test('should handle mixed circular and non-circular references', () => {
      const shared = { shared: true };
      const obj = {
        a: shared,
        b: shared,  // Not circular, just shared
        c: {}
      };
      obj.c.circular = obj;  // This is circular
      
      const result = safeJsonStringify(obj);
      const parsed = JSON.parse(result);
      
      expect(parsed.a).toEqual({ shared: true });
      expect(parsed.b).toEqual({ shared: true });
      expect(parsed.c.circular).toBe('[Circular]');
    });

    test('should handle objects with toJSON methods', () => {
      const obj = {
        toJSON() {
          return { custom: 'representation' };
        }
      };
      
      expect(safeJsonStringify(obj)).toBe('{"custom":"representation"}');
    });

    test('should handle Date objects', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const stringified = safeJsonStringify({ date });
      const parsed = safeJsonParse(stringified);
      
      expect(parsed.date).toBe('2024-01-01T00:00:00.000Z');
    });
  });
});