import { Logger } from '../../utils/logger';
import {
  Variables,
  VariableReplacementOptions,
  VariableReplacementResult,
  VariableReplacement
} from '../../types';

/**
 * Variable Replacement Service
 * 
 * Handles variable replacement in strings, objects, and complex data structures.
 * Supports recursive replacement, multiple sources, and escape patterns.
 */
export class VariableReplacementService {
  private logger: Logger;
  private defaultOptions: VariableReplacementOptions = {
    enableRecursive: true,
    maxDepth: 10,
    escapePattern: '\\{{',
  };

  constructor() {
    this.logger = new Logger('VariableReplacementService');
  }

  /**
   * Replace variables in any data structure
   */
  async replaceVariables(
    data: any,
    variables: Variables,
    options: Partial<VariableReplacementOptions> = {}
  ): Promise<VariableReplacementResult> {
    const opts: VariableReplacementOptions = { ...this.defaultOptions, ...options };
    const replacements: VariableReplacement[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.debug('Starting variable replacement', { 
        dataType: typeof data, 
        variableCount: Object.keys(variables).length 
      });

      const processedValue = this.processValue(
        data,
        variables,
        opts,
        replacements,
        errors,
        warnings,
        0
      );

      const result: VariableReplacementResult = {
        originalValue: data,
        processedValue,
        replacements,
        errors,
        warnings,
      };

      this.logger.debug('Variable replacement completed', {
        replacements: replacements.length,
        errors: errors.length,
        warnings: warnings.length
      });

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Variable replacement failed: ${errorMsg}`);
      
      return {
        originalValue: data,
        processedValue: data,
        replacements,
        errors,
        warnings,
      };
    }
  }

  /**
   * Process a value recursively
   */
  private processValue(
    value: any,
    variables: Variables,
    options: VariableReplacementOptions,
    replacements: VariableReplacement[],
    errors: string[],
    warnings: string[],
    depth: number
  ): any {
    // Check recursion depth
    if (depth > options.maxDepth) {
      warnings.push(`Maximum recursion depth (${options.maxDepth}) reached`);
      return value;
    }

    // Handle different data types
    if (typeof value === 'string') {
      return this.replaceInString(value, variables, options, replacements, errors, warnings, depth);
    } else if (Array.isArray(value)) {
      return this.replaceInArray(value, variables, options, replacements, errors, warnings, depth);
    } else if (value && typeof value === 'object') {
      return this.replaceInObject(value, variables, options, replacements, errors, warnings, depth);
    }

    return value;
  }

  /**
   * Replace variables in string using {{variable}} syntax
   */
  private replaceInString(
    text: string,
    variables: Variables,
    options: VariableReplacementOptions,
    replacements: VariableReplacement[],
    errors: string[],
    warnings: string[],
    depth: number
  ): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // Handle escaped patterns
    const escapePattern = options.escapePattern || '\\{{';
    const tempEscapeMarker = '___ESCAPED_VAR___';
    const textWithEscapes = text.replace(new RegExp(escapePattern, 'g'), tempEscapeMarker);

    // Variable pattern: {{variableName}}
    const variablePattern = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    let result = textWithEscapes;
    let match;

    while ((match = variablePattern.exec(textWithEscapes)) !== null) {
      const fullMatch = match[0];
      const variablePath = match[1];
      const startPos = match.index;
      const endPos = match.index + fullMatch.length;

      try {
        // Get variable value
        const variableValue = this.getVariableValue(variablePath || '', variables);

        if (variableValue !== undefined && variablePath) {
          let replacementValue = String(variableValue);

          // Recursive replacement if enabled
          if (options.enableRecursive && typeof variableValue === 'string' && depth < options.maxDepth) {
            replacementValue = this.processValue(
              variableValue,
              variables,
              options,
              replacements,
              errors,
              warnings,
              depth + 1
            );
          }

          // Record replacement
          replacements.push({
            variable: variablePath,
            originalValue: fullMatch,
            replacedValue: replacementValue,
            source: this.determineVariableSource(variablePath, variables),
            position: { start: startPos, end: endPos },
          });

          // Replace in result
          result = result.replace(fullMatch, replacementValue);
        } else {
          if (variablePath) {
            warnings.push(`Variable '${variablePath}' not found`);
          }
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        if (variablePath) {
          errors.push(`Failed to replace variable '${variablePath}': ${errorMsg}`);
        } else {
          errors.push(`Failed to replace variable: ${errorMsg}`);
        }
      }
    }

    // Restore escaped patterns
    result = result.replace(new RegExp(tempEscapeMarker, 'g'), '{{');

    return result;
  }

  /**
   * Replace variables in array
   */
  private replaceInArray(
    array: any[],
    variables: Variables,
    options: VariableReplacementOptions,
    replacements: VariableReplacement[],
    errors: string[],
    warnings: string[],
    depth: number
  ): any[] {
    const result: any[] = [];

    for (let i = 0; i < array.length; i++) {
      try {
        const processedItem = this.processValue(
          array[i],
          variables,
          options,
          replacements,
          errors,
          warnings,
          depth + 1
        );
        result[i] = processedItem;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to process array item at index ${i}: ${errorMsg}`);
        result[i] = array[i];
      }
    }

    return result;
  }

  /**
   * Replace variables in object
   */
  private replaceInObject(
    obj: Record<string, any>,
    variables: Variables,
    options: VariableReplacementOptions,
    replacements: VariableReplacement[],
    errors: string[],
    warnings: string[],
    depth: number
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      try {
        // Process the key itself
        const processedKey = this.processValue(
          key,
          variables,
          options,
          replacements,
          errors,
          warnings,
          depth + 1
        );

        // Process the value
        const processedValue = this.processValue(
          value,
          variables,
          options,
          replacements,
          errors,
          warnings,
          depth + 1
        );

        result[processedKey] = processedValue;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to process object property '${key}': ${errorMsg}`);
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Get variable value using dot notation
   */
  private getVariableValue(path: string, variables: Variables): any {
    const keys = path.split('.');
    let current = variables;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Determine the source of a variable
   */
  private determineVariableSource(
    variablePath: string,
    _variables: Variables
  ): 'global' | 'workspace' | 'environment' | 'custom' {
    // This is a simplified implementation
    // In a real scenario, you'd check which source contains the variable
    if (variablePath.startsWith('global.')) return 'global';
    if (variablePath.startsWith('workspace.')) return 'workspace';
    if (variablePath.startsWith('env.')) return 'environment';
    return 'custom';
  }

  /**
   * Validate variable syntax in a string
   */
  validateVariableSyntax(text: string): { valid: boolean; errors: string[]; variables: string[] } {
    const errors: string[] = [];
    const variablesList: string[] = [];

    if (!text || typeof text !== 'string') {
      return { valid: true, errors, variables: variablesList };
    }

    // Find all variable patterns
    const variablePattern = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    const malformedPattern = /\{\{[^}]*\}\}/g;
    
    let match;
    
    // Check for valid variables
    while ((match = variablePattern.exec(text)) !== null) {
      const variableName = match[1];
      if (variableName && !variablesList.includes(variableName)) {
        variablesList.push(variableName);
      }
    }

    // Check for malformed variables
    const malformedMatches = text.match(malformedPattern) || [];
    const validMatches = text.match(variablePattern) || [];
    
    const validMatchesSet = new Set(validMatches);
    const malformed = malformedMatches.filter(m => m && !validMatchesSet.has(m));
    
    malformed.forEach(malformedVar => {
      if (malformedVar) {
        errors.push(`Malformed variable syntax: ${malformedVar}`);
      }
    });

    // Check for unmatched braces
    const openBraces = (text.match(/\{\{/g) || []).length;
    const closeBraces = (text.match(/\}\}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      errors.push('Unmatched variable braces detected');
    }

    return {
      valid: errors.length === 0,
      errors,
      variables: variablesList,
    };
  }

  /**
   * Extract all variable references from data
   */
  extractVariableReferences(data: any): string[] {
    const variablesSet = new Set<string>();

    const extract = (value: any) => {
      if (typeof value === 'string') {
        const result = this.validateVariableSyntax(value);
        result.variables.forEach(v => variablesSet.add(v));
      } else if (Array.isArray(value)) {
        value.forEach(extract);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(extract);
      }
    };

    extract(data);
    return Array.from(variablesSet);
  }

  /**
   * Preview variable replacement without applying it
   */
  previewReplacement(
    text: string,
    variables: Variables
  ): { preview: string; replacements: VariableReplacement[]; warnings: string[] } {
    const replacements: VariableReplacement[] = [];
    const warnings: string[] = [];

    if (!text || typeof text !== 'string') {
      return { preview: text, replacements, warnings };
    }

    const variablePattern = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    let preview = text;
    let match;

    while ((match = variablePattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const variablePath = match[1];
      
      if (!variablePath) {
        continue;
      }

      const variableValue = this.getVariableValue(variablePath, variables);

      if (variableValue !== undefined) {
        replacements.push({
          variable: variablePath,
          originalValue: fullMatch,
          replacedValue: String(variableValue),
          source: this.determineVariableSource(variablePath, variables),
          position: { start: match.index, end: match.index + fullMatch.length },
        });

        preview = preview.replace(fullMatch, String(variableValue));
      } else {
        warnings.push(`Variable '${variablePath}' not found`);
      }
    }

    return { preview, replacements, warnings };
  }
}