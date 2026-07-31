import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from 'fastify';
import { z } from 'zod';
import {
  analysisFunctionIdentifier,
  type AnalysisFunctionKind,
  type AnalysisLimits as RuntimeLimits,
  type AnalysisQueryRequestV1
} from '@logbook/analysis-sdk';
import type { AppConfig } from '../config.js';
import type { DatabasePool } from '../db/pool.js';
import { AnalysisRepository } from '../analysis/repository.js';
import { queryAnalysisInputs } from '../analysis/query-service.js';
import { validateAnalysisProgram } from '../analysis/validation-service.js';
import { analysisSourceHash } from '../analysis/source-hash.js';

const uuid = z.string().uuid();
const alias = z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
const querySchema = z.object({
  schemaVersion: z.literal(1),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  timeZone: z.string().min(1).max(100),
  inputs: z.array(z.object({
    alias,
    eventTypeKey: z.string().min(1).max(64),
    displayUnitKey: z.string().min(1).max(64).optional(),
    rowsBefore: z.number().int().min(0).max(10_000).optional(),
    rowsAfter: z.number().int().min(0).max(10_000).optional(),
    includeOngoing: z.boolean().optional()
  })).min(1).max(12)
});
const bindingSchema = z.object({
  alias,
  functionKey: z.string().min(1).max(64).optional(),
  functionRevisionId: uuid,
  functionKind: z.enum([
    'event-filter',
    'point-map',
    'point-filter',
    'map-filter',
    'window-transform',
    'reducer',
    'series-transform'
  ]),
  sourceBody: z.string().max(100_000),
  options: z.record(z.string(), z.unknown()).optional()
});
const savedBindingSchema = z.object({
  alias,
  functionRevisionId: uuid,
  options: z.record(z.string(), z.unknown()).optional()
});
const validationSchema = z.object({
  sourceBody: z.string().max(100_000),
  inputAliases: z.array(alias).min(1).max(12),
  functionBindings: z.array(bindingSchema).default([])
});
const programInputSchema = z.object({
  alias,
  eventTypeKey: z.string().min(1).max(64),
  displayUnitKey: z.string().min(1).max(64).optional(),
  rowsBefore: z.number().int().min(0).max(10_000).optional(),
  rowsAfter: z.number().int().min(0).max(10_000).optional(),
  contextIsExplicit: z.boolean().optional(),
  includeOngoing: z.boolean().optional()
});
const programRevisionSchema = z.object({
  sourceBody: z.string().max(100_000),
  pipelineDefinition: z.unknown().optional(),
  defaultRange: z.string().max(32).optional(),
  outputOptions: z.record(z.string(), z.unknown()).optional(),
  inputs: z.array(programInputSchema).min(1).max(12),
  functionBindings: z.array(savedBindingSchema).default([])
});
const functionKind = z.enum([
  'event-filter',
  'point-map',
  'point-filter',
  'map-filter',
  'window-transform',
  'reducer',
  'series-transform'
]);

type ParsedBinding = {
  alias: string;
  functionKey?: string;
  functionRevisionId: string;
  functionKind: AnalysisFunctionKind;
  sourceBody: string;
  options?: Record<string, unknown>;
};
type ParsedProgramInput = {
  alias: string;
  eventTypeKey: string;
  displayUnitKey?: string;
  rowsBefore?: number;
  rowsAfter?: number;
  contextIsExplicit?: boolean;
  includeOngoing?: boolean;
};
type ParsedSavedBinding = {
  alias: string;
  functionRevisionId: string;
  options?: Record<string, unknown>;
};
type ParsedProgramRevision = {
  sourceBody: string;
  pipelineDefinition?: unknown;
  defaultRange?: string;
  outputOptions?: Record<string, unknown>;
  inputs: ParsedProgramInput[];
  functionBindings: ParsedSavedBinding[];
};
type ResolvedFunctionBinding = Awaited<
  ReturnType<AnalysisRepository['resolveFunctionBindings']>
>[number];

type CreateProgramInput = Parameters<AnalysisRepository['createProgram']>[0];
type UpdateProgramInput = Parameters<AnalysisRepository['updateProgram']>[1];
type CreateFunctionInput = Parameters<AnalysisRepository['createFunction']>[0];
type UpdateFunctionInput = Parameters<AnalysisRepository['updateFunction']>[1];
type CreateExplorationInput = Parameters<AnalysisRepository['createExploration']>[0];
type UpdateExplorationInput = Parameters<AnalysisRepository['updateExploration']>[1];

function runtimeLimits(config: AppConfig): RuntimeLimits {
  return {
    timeoutMs: config.analysis.executionTimeoutMs,
    memoryBytes: config.analysis.memoryLimitBytes,
    stackBytes: config.analysis.stackLimitBytes,
    maxInputEvents: config.analysis.maxInputEvents,
    maxOutputPoints: config.analysis.maxOutputPoints,
    maxOutputSeries: config.analysis.maxOutputSeries,
    maxLogs: config.analysis.maxConsoleEntries,
    maxSerializedBytes: config.analysis.maxSerializedResultBytes,
    workerPoolSize: config.analysis.workerPoolSize
  };
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({
    error: 'not_found',
    message: 'Analysis resource was not found'
  });
}

function conflict(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(409).send({ error: 'conflict', message });
}

function functionValidationProgram(
  kind: AnalysisFunctionKind,
  aliasName: string
): string {
  switch (kind) {
    case 'event-filter':
      return `return event.filter(${aliasName}, {}, context).values();`;
    case 'point-map':
      return `return event.values().map(${aliasName}, {}, context);`;
    case 'point-filter':
      return `return event.values().filter(${aliasName}, {}, context);`;
    case 'map-filter':
      return `return event.values().mapFilter(${aliasName}, {}, context);`;
    case 'window-transform':
      return `return event.values().transformWindow(${aliasName}, 4, { partial: true }, context);`;
    case 'reducer':
      return `return event.values().reduce(${aliasName}, {}, context);`;
    case 'series-transform':
      return `return ${aliasName}(event.values(), {}, context);`;
  }
}

export async function registerAnalysisRoutes(
  app: FastifyInstance,
  db: DatabasePool,
  config: AppConfig
): Promise<void> {
  const repository = new AnalysisRepository(db);
  const limits = runtimeLimits(config);

  app.post('/analysis/query', async (request: FastifyRequest) =>
    queryAnalysisInputs(
      db,
      querySchema.parse(request.body) as AnalysisQueryRequestV1,
      config.analysis
    )
  );
  app.post('/analysis/validate', async (request: FastifyRequest) => {
    const body = validationSchema.parse(request.body) as {
      sourceBody: string;
      inputAliases: string[];
      functionBindings: ParsedBinding[];
    };
    return validateAnalysisProgram({
      sourceBody: body.sourceBody,
      inputAliases: body.inputAliases,
      functionBindings: body.functionBindings.map((item: ParsedBinding) => ({
        alias: item.alias,
        ...(item.functionKey === undefined ? {} : { functionKey: item.functionKey }),
        functionKind: item.functionKind,
        sourceBody: item.sourceBody,
        ...(item.options === undefined ? {} : { options: item.options })
      }))
    }, limits);
  });

  app.get('/analysis/programs', async () => repository.listPrograms());
  app.post('/analysis/programs', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const body = z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(2_000).optional(),
      editorMode: z.enum(['pipeline', 'code']).default('pipeline')
    }).parse(request.body);
    const input: CreateProgramInput = {
      name: body.name,
      editorMode: body.editorMode,
      ...(body.description === undefined
        ? {}
        : { description: body.description })
    };
    return reply.code(201).send(await repository.createProgram(input));
  });
  app.get('/analysis/programs/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return (await repository.getProgram(id)) ?? notFound(reply);
  });
  app.patch('/analysis/programs/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2_000).nullable().optional(),
      editorMode: z.enum(['pipeline', 'code']).optional(),
      expectedUpdatedAt: z.iso.datetime().optional()
    }).parse(request.body);
    const input: UpdateProgramInput = {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      ...(body.editorMode === undefined
        ? {}
        : { editorMode: body.editorMode }),
      ...(body.expectedUpdatedAt === undefined
        ? {}
        : { expectedUpdatedAt: body.expectedUpdatedAt })
    };
    const updated = await repository.updateProgram(id, input);
    return updated ?? conflict(reply, 'Program changed or does not exist');
  });
  app.post('/analysis/programs/:id/duplicate', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const duplicated = await repository.duplicateProgram(id);
    return duplicated ? reply.code(201).send(duplicated) : notFound(reply);
  });
  app.post('/analysis/programs/:id/revisions', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = programRevisionSchema.parse(request.body) as ParsedProgramRevision;
    const resolvedBindings = await repository.resolveFunctionBindings(
      body.functionBindings
    );
    const report = await validateAnalysisProgram({
      sourceBody: body.sourceBody,
      inputAliases: body.inputs.map(
        (input: ParsedProgramInput) => input.alias
      ),
      functionBindings: resolvedBindings.map(
        (item: ResolvedFunctionBinding) => ({
          alias: item.alias,
          functionKey: item.functionKey,
          functionKind: item.functionKind as AnalysisFunctionKind,
          sourceBody: item.sourceBody,
          ...(item.options === undefined ? {} : { options: item.options })
        })
      )
    }, limits);
    const revision = await repository.createProgramRevision(id, {
      sourceBody: body.sourceBody,
      ...(body.pipelineDefinition === undefined
        ? {}
        : { pipelineDefinition: body.pipelineDefinition }),
      ...(body.defaultRange === undefined
        ? {}
        : { defaultRange: body.defaultRange }),
      ...(body.outputOptions === undefined
        ? {}
        : { outputOptions: body.outputOptions }),
      sourceHash: report.sourceHash,
      validationStatus: report.status,
      validationReport: report,
      inputs: body.inputs,
      functionBindings: body.functionBindings.map(
        (item: ParsedSavedBinding) => ({
          alias: item.alias,
          functionRevisionId: item.functionRevisionId,
          ...(item.options === undefined ? {} : { options: item.options })
        })
      )
    });
    return reply.code(201).send({
      ...(revision as object),
      validationReport: report
    });
  });
  app.post('/analysis/programs/:id/publish/:revisionId', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id, revisionId } = z.object({
      id: uuid,
      revisionId: uuid
    }).parse(request.params);
    return (await repository.publishProgramRevision(id, revisionId)) ??
      conflict(
        reply,
        'Only a passed revision belonging to this program can be published'
      );
  });
  app.delete('/analysis/programs/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return (await repository.deleteProgram(id))
      ? reply.code(204).send()
      : notFound(reply);
  });

  app.get('/analysis/functions', async () => repository.listFunctions());
  app.post('/analysis/functions', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const body = z.object({
      functionKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      name: z.string().min(1).max(200),
      description: z.string().max(2_000).optional(),
      functionKind
    }).parse(request.body);
    const input: CreateFunctionInput = {
      functionKey: body.functionKey,
      name: body.name,
      functionKind: body.functionKind,
      ...(body.description === undefined
        ? {}
        : { description: body.description })
    };
    return reply.code(201).send(await repository.createFunction(input));
  });
  app.get('/analysis/functions/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return (await repository.getFunction(id)) ?? notFound(reply);
  });
  app.patch('/analysis/functions/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2_000).nullable().optional(),
      expectedUpdatedAt: z.iso.datetime().optional()
    }).parse(request.body);
    const input: UpdateFunctionInput = {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.description === undefined
        ? {}
        : { description: body.description }),
      ...(body.expectedUpdatedAt === undefined
        ? {}
        : { expectedUpdatedAt: body.expectedUpdatedAt })
    };
    const updated = await repository.updateFunction(id, input);
    return updated ?? conflict(
      reply,
      'Function changed, is system-owned, or does not exist'
    );
  });
  app.post('/analysis/functions/:id/duplicate', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const duplicated = await repository.duplicateFunction(id);
    return duplicated ? reply.code(201).send(duplicated) : notFound(reply);
  });
  app.post('/analysis/functions/:id/revisions', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({
      alias: alias.default('udf'),
      functionKind: functionKind.optional(),
      sourceBody: z.string().max(100_000),
      parameterSchema: z.unknown().optional(),
      defaultOptions: z.unknown().optional(),
      outputMetadata: z.unknown().optional()
    }).parse(request.body);
    const definition = await repository.getFunctionDefinition(id);
    if (!definition) return notFound(reply);
    if (definition.isSystem) {
      return conflict(reply, 'System functions are immutable');
    }
    const actualKind = definition.functionKind as AnalysisFunctionKind;
    if (body.functionKind && body.functionKind !== actualKind) {
      return conflict(
        reply,
        'Function kind cannot change between revisions'
      );
    }
    const runtimeAlias = analysisFunctionIdentifier(definition.functionKey);
    const report = await validateAnalysisProgram({
      sourceBody: functionValidationProgram(actualKind, runtimeAlias),
      inputAliases: ['event'],
      functionBindings: [{
        alias: runtimeAlias,
        functionKey: definition.functionKey,
        functionKind: actualKind,
        sourceBody: body.sourceBody
      }]
    }, limits);
    const revision = await repository.createFunctionRevision(id, {
      sourceBody: body.sourceBody,
      ...(body.parameterSchema === undefined
        ? {}
        : { parameterSchema: body.parameterSchema }),
      ...(body.defaultOptions === undefined
        ? {}
        : { defaultOptions: body.defaultOptions }),
      ...(body.outputMetadata === undefined
        ? {}
        : { outputMetadata: body.outputMetadata }),
      sourceHash: analysisSourceHash({
        kind: actualKind,
        sourceBody: body.sourceBody
      }),
      validationStatus: report.status,
      validationReport: report
    });
    return reply.code(201).send({
      ...(revision as object),
      validationReport: report
    });
  });
  app.post('/analysis/functions/:id/publish/:revisionId', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id, revisionId } = z.object({
      id: uuid,
      revisionId: uuid
    }).parse(request.params);
    return (await repository.publishFunctionRevision(id, revisionId)) ??
      conflict(
        reply,
        'Only a passed revision belonging to this function can be published'
      );
  });
  app.delete('/analysis/functions/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return (await repository.deleteFunction(id))
      ? reply.code(204).send()
      : conflict(reply, 'System functions cannot be deleted');
  });

  app.get('/explorations', async () => repository.listExplorations());
  app.post('/explorations', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const body = z.object({
      programId: uuid,
      autoRun: z.boolean().optional(),
      editorPreferences: z.unknown().optional()
    }).parse(request.body);
    const input: CreateExplorationInput = {
      programId: body.programId,
      ...(body.autoRun === undefined ? {} : { autoRun: body.autoRun }),
      ...(body.editorPreferences === undefined
        ? {}
        : { editorPreferences: body.editorPreferences })
    };
    return reply.code(201).send(await repository.createExploration(input));
  });
  app.get('/explorations/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return (await repository.getExploration(id)) ?? notFound(reply);
  });
  app.patch('/explorations/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({
      autoRun: z.boolean().optional(),
      editorPreferences: z.unknown().optional(),
      expectedUpdatedAt: z.iso.datetime().optional()
    }).parse(request.body);
    const input: UpdateExplorationInput = {
      ...(body.autoRun === undefined ? {} : { autoRun: body.autoRun }),
      ...(body.editorPreferences === undefined
        ? {}
        : { editorPreferences: body.editorPreferences }),
      ...(body.expectedUpdatedAt === undefined
        ? {}
        : { expectedUpdatedAt: body.expectedUpdatedAt })
    };
    return (await repository.updateExploration(id, input)) ??
      conflict(reply, 'Exploration changed or does not exist');
  });
  app.delete('/explorations/:id', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return (await repository.deleteExploration(id))
      ? reply.code(204).send()
      : notFound(reply);
  });
}
