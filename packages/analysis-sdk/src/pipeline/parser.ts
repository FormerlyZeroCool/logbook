import { parseExpression } from '@babel/parser';
import type { PipelineStep, SourceDiagnostic } from '../contracts.js';
import { typeCheckPipeline, type FunctionBindingTypes } from './type-checker.js';

function diagnostic(error: unknown): SourceDiagnostic {
  const value = error as { message?: string; loc?: { line: number; column: number } };
  return { severity: 'error', code: 'pipeline_parse_error', message: value.message ?? 'Could not parse pipeline', line: value.loc?.line ?? 1, column: (value.loc?.column ?? 0) + 1 };
}
function literal(node: any): unknown {
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'ArrayExpression') return node.elements.map((element: any) => literal(element));
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map((property: any) => {
    if (property.type !== 'ObjectProperty' || property.computed) throw new Error('Pipeline object keys must be plain literals');
    const key = property.key.name ?? property.key.value;
    return [key, literal(property.value)];
  }));
  throw new Error(`Unsupported pipeline argument node: ${node.type}`);
}

export function parsePipelineExpression(source: string, bindings: FunctionBindingTypes = {}) {
  try {
    let node: any = parseExpression(source, { sourceType: 'script' });
    const calls: any[] = [];
    while (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed) {
      calls.unshift(node);
      node = node.callee.object;
    }
    if (node.type !== 'Identifier') throw new Error('Pipeline must start with an input alias');
    const steps: PipelineStep[] = calls.map((call) => {
      const operation = call.callee.property.name as string;
      const args = call.arguments;
      const first = args[0];
      const functionBinding = first?.type === 'Identifier' ? first.name as string : undefined;
      if (functionBinding) {
        const windowSize = operation === 'transformWindow' || operation === 'windowedMap' || operation === 'windowed_map' ? literal(args[1]) as number : undefined;
        const optionNode = operation === 'transformWindow' || operation === 'windowedMap' || operation === 'windowed_map' ? args[2] : args[1];
        const options = optionNode ? literal(optionNode) as Record<string, unknown> : undefined;
        return { operation, functionBinding, ...(windowSize === undefined ? {} : { windowSize }), ...(options === undefined ? {} : { options }) };
      }
      return { operation, arguments: args.map((argument: any) => literal(argument)) };
    });
    return typeCheckPipeline(node.name as string, steps, bindings);
  } catch (error) {
    return { definition: null, diagnostics: [diagnostic(error)] };
  }
}
