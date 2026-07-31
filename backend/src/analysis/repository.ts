import type { PoolClient } from 'pg';
import type { DatabasePool } from '../db/pool.js';

export type ProgramInputDraft = {
  alias: string;
  eventTypeKey: string;
  displayUnitKey?: string;
  rowsBefore?: number;
  rowsAfter?: number;
  contextIsExplicit?: boolean;
  includeOngoing?: boolean;
};

export type FunctionBindingDraft = {
  alias: string;
  functionRevisionId: string;
  options?: Record<string, unknown>;
};

export type ProgramRevisionDraft = {
  sourceBody: string;
  pipelineDefinition?: unknown;
  defaultRange?: string;
  outputOptions?: Record<string, unknown>;
  sourceHash: string;
  validationStatus: 'passed' | 'failed' | 'syntax-error';
  validationReport: unknown;
  inputs: ProgramInputDraft[];
  functionBindings?: FunctionBindingDraft[];
};

async function resolveInputIds(client: PoolClient, input: ProgramInputDraft): Promise<{ eventTypeId: string; unitId: string | null }> {
  const eventType = await client.query<{ id: string; unit_type_id: string | null }>('SELECT id, unit_type_id FROM event_types WHERE key = $1', [input.eventTypeKey]);
  const row = eventType.rows[0];
  if (!row) throw new Error(`Unknown event type: ${input.eventTypeKey}`);
  if (!input.displayUnitKey) return { eventTypeId: row.id, unitId: null };
  const unit = await client.query<{ id: string }>('SELECT id FROM units WHERE key = $1 AND unit_type_id = $2', [input.displayUnitKey, row.unit_type_id]);
  if (!unit.rows[0]) throw new Error(`Unit ${input.displayUnitKey} is not valid for ${input.eventTypeKey}`);
  return { eventTypeId: row.id, unitId: unit.rows[0].id };
}

export class AnalysisRepository {
  constructor(private readonly db: DatabasePool) {}

  async listPrograms(): Promise<unknown[]> {
    const result = await this.db.query(`
      SELECT p.*, draft.revision AS draft_revision, draft.validation_status AS draft_validation_status,
             published.revision AS published_revision, published.validation_status AS published_validation_status
      FROM analysis_programs p
      LEFT JOIN analysis_program_revisions draft ON draft.id = p.draft_revision_id
      LEFT JOIN analysis_program_revisions published ON published.id = p.published_revision_id
      ORDER BY p.updated_at DESC, p.name
    `);
    return result.rows;
  }

  async createProgram(input: { name: string; description?: string; editorMode: 'pipeline' | 'code' }): Promise<unknown> {
    const result = await this.db.query('INSERT INTO analysis_programs(name, description, editor_mode) VALUES ($1,$2,$3) RETURNING *', [input.name, input.description ?? null, input.editorMode]);
    return result.rows[0];
  }

  async getProgram(id: string): Promise<unknown | null> {
    const program = await this.db.query('SELECT * FROM analysis_programs WHERE id = $1', [id]);
    if (!program.rows[0]) return null;
    const revisions = await this.db.query(`
      SELECT r.*,
        COALESCE((SELECT json_agg(json_build_object(
          'alias', i.alias, 'position', i.position, 'eventTypeKey', et.key, 'displayUnitKey', u.key,
          'rowsBefore', i.rows_before, 'rowsAfter', i.rows_after, 'contextIsExplicit', i.context_is_explicit,
          'includeOngoing', i.include_ongoing) ORDER BY i.position)
          FROM analysis_program_inputs i JOIN event_types et ON et.id=i.event_type_id LEFT JOIN units u ON u.id=i.display_unit_id WHERE i.revision_id=r.id), '[]'::json) AS inputs,
        COALESCE((SELECT json_agg(json_build_object(
          'alias', b.alias, 'position', b.position, 'options', b.options, 'functionRevisionId', fr.id,
          'functionKey', f.function_key, 'functionKind', f.function_kind, 'sourceBody', fr.source_body) ORDER BY b.position)
          FROM analysis_program_function_bindings b JOIN analysis_function_revisions fr ON fr.id=b.function_revision_id JOIN analysis_functions f ON f.id=fr.function_id WHERE b.program_revision_id=r.id), '[]'::json) AS function_bindings
      FROM analysis_program_revisions r WHERE r.program_id=$1 ORDER BY r.revision DESC
    `, [id]);
    return { ...program.rows[0], revisions: revisions.rows };
  }

  async updateProgram(id: string, input: { name?: string; description?: string | null; editorMode?: 'pipeline' | 'code'; expectedUpdatedAt?: string }): Promise<unknown | null> {
    const result = await this.db.query(`
      UPDATE analysis_programs SET
        name = COALESCE($2, name), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
        editor_mode = COALESCE($5, editor_mode)
      WHERE id=$1 AND ($6::timestamptz IS NULL OR updated_at=$6::timestamptz)
      RETURNING *
    `, [id, input.name ?? null, Object.hasOwn(input, 'description'), input.description ?? null, input.editorMode ?? null, input.expectedUpdatedAt ?? null]);
    return result.rows[0] ?? null;
  }

  async duplicateProgram(id: string): Promise<unknown | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const sourceResult = await client.query<{
        name: string; description: string | null; editor_mode: 'pipeline' | 'code';
        draft_revision_id: string | null; published_revision_id: string | null;
      }>('SELECT name,description,editor_mode,draft_revision_id,published_revision_id FROM analysis_programs WHERE id=$1 FOR SHARE', [id]);
      const source = sourceResult.rows[0];
      if (!source) { await client.query('ROLLBACK'); return null; }
      const created = await client.query<{ id: string }>(`INSERT INTO analysis_programs(name,description,editor_mode) VALUES ($1,$2,$3) RETURNING id`, [`${source.name} copy`, source.description, source.editor_mode]);
      const programId = created.rows[0]!.id;
      const sourceRevisionId = source.published_revision_id ?? source.draft_revision_id;
      if (sourceRevisionId) {
        const revision = await client.query<{ id: string; validation_status: string }>(`
          INSERT INTO analysis_program_revisions(program_id,revision,schema_version,sdk_version,pipeline_registry_version,source_body,pipeline_definition,default_range,output_options,source_hash,validation_status,validation_report,validated_at)
          SELECT $1,1,schema_version,sdk_version,pipeline_registry_version,source_body,pipeline_definition,default_range,output_options,source_hash,validation_status,validation_report,validated_at
          FROM analysis_program_revisions WHERE id=$2 RETURNING id,validation_status
        `, [programId, sourceRevisionId]);
        const copied = revision.rows[0];
        if (copied) {
          await client.query(`INSERT INTO analysis_program_inputs(revision_id,position,alias,event_type_id,display_unit_id,rows_before,rows_after,context_is_explicit,include_ongoing) SELECT $1,position,alias,event_type_id,display_unit_id,rows_before,rows_after,context_is_explicit,include_ongoing FROM analysis_program_inputs WHERE revision_id=$2`, [copied.id, sourceRevisionId]);
          await client.query(`INSERT INTO analysis_program_function_bindings(program_revision_id,function_revision_id,alias,position,options) SELECT $1,function_revision_id,alias,position,options FROM analysis_program_function_bindings WHERE program_revision_id=$2`, [copied.id, sourceRevisionId]);
          await client.query(`UPDATE analysis_programs SET draft_revision_id=$2,published_revision_id=CASE WHEN $3::boolean AND $4='passed' THEN $2 ELSE NULL END WHERE id=$1`, [programId, copied.id, source.published_revision_id === sourceRevisionId, copied.validation_status]);
        }
      }
      await client.query('COMMIT');
      return (await this.db.query('SELECT * FROM analysis_programs WHERE id=$1', [programId])).rows[0] ?? null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async createProgramRevision(programId: string, draft: ProgramRevisionDraft): Promise<unknown> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const revisionResult = await client.query<{ id: string; revision: number }>(`
        INSERT INTO analysis_program_revisions(
          program_id, revision, source_body, pipeline_definition, default_range, output_options,
          source_hash, validation_status, validation_report, validated_at)
        SELECT $1, COALESCE(MAX(revision),0)+1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8::jsonb, now()
        FROM analysis_program_revisions WHERE program_id=$1
        RETURNING id, revision
      `, [programId, draft.sourceBody, JSON.stringify(draft.pipelineDefinition ?? null), draft.defaultRange ?? '2d', JSON.stringify(draft.outputOptions ?? {}), draft.sourceHash, draft.validationStatus, JSON.stringify(draft.validationReport)]);
      const revision = revisionResult.rows[0];
      if (!revision) throw new Error('Could not create analysis revision');
      for (const [position, input] of draft.inputs.entries()) {
        const ids = await resolveInputIds(client, input);
        await client.query(`
          INSERT INTO analysis_program_inputs(revision_id, position, alias, event_type_id, display_unit_id, rows_before, rows_after, context_is_explicit, include_ongoing)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [revision.id, position, input.alias, ids.eventTypeId, ids.unitId, input.rowsBefore ?? 0, input.rowsAfter ?? 0, input.contextIsExplicit ?? false, input.includeOngoing ?? true]);
      }
      for (const [position, binding] of (draft.functionBindings ?? []).entries()) {
        const inserted = await client.query(`
          INSERT INTO analysis_program_function_bindings(program_revision_id,function_revision_id,alias,position,options)
          SELECT $1,fr.id,$3,$4,$5::jsonb
          FROM analysis_function_revisions fr JOIN analysis_functions f ON f.id=fr.function_id
          WHERE fr.id=$2 AND fr.validation_status='passed' AND f.published_revision_id=fr.id
          RETURNING id
        `, [revision.id, binding.functionRevisionId, binding.alias, position, JSON.stringify(binding.options ?? {})]);
        if (!inserted.rows[0]) throw new Error(`Function binding ${binding.alias} must reference a published passed revision`);
      }
      await client.query('UPDATE analysis_programs SET draft_revision_id=$2 WHERE id=$1', [programId, revision.id]);
      await client.query('COMMIT');
      return revision;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async publishProgramRevision(programId: string, revisionId: string): Promise<unknown | null> {
    const result = await this.db.query(`
      UPDATE analysis_programs p SET published_revision_id=r.id
      FROM analysis_program_revisions r
      WHERE p.id=$1 AND r.id=$2 AND r.program_id=p.id AND r.validation_status='passed'
      RETURNING p.*
    `, [programId, revisionId]);
    return result.rows[0] ?? null;
  }

  async deleteProgram(id: string): Promise<boolean> {
    return (await this.db.query('DELETE FROM analysis_programs WHERE id=$1', [id])).rowCount === 1;
  }

  async listFunctions(): Promise<unknown[]> {
    const result = await this.db.query(`
      SELECT f.*, draft.revision AS draft_revision, draft.validation_status AS draft_validation_status,
             published.revision AS published_revision, published.validation_status AS published_validation_status
      FROM analysis_functions f
      LEFT JOIN analysis_function_revisions draft ON draft.id=f.draft_revision_id
      LEFT JOIN analysis_function_revisions published ON published.id=f.published_revision_id
      ORDER BY f.is_system DESC, f.name
    `);
    return result.rows;
  }

  async createFunction(input: { functionKey: string; name: string; description?: string; functionKind: string }): Promise<unknown> {
    const result = await this.db.query('INSERT INTO analysis_functions(function_key,name,description,function_kind) VALUES ($1,$2,$3,$4) RETURNING *', [input.functionKey, input.name, input.description ?? null, input.functionKind]);
    return result.rows[0];
  }

  async getFunction(id: string): Promise<unknown | null> {
    const result = await this.db.query(`
      SELECT f.*, COALESCE(json_agg(fr ORDER BY fr.revision DESC) FILTER (WHERE fr.id IS NOT NULL),'[]'::json) AS revisions
      FROM analysis_functions f LEFT JOIN analysis_function_revisions fr ON fr.function_id=f.id
      WHERE f.id=$1 GROUP BY f.id
    `, [id]);
    return result.rows[0] ?? null;
  }

  async updateFunction(id: string, input: { name?: string; description?: string | null; expectedUpdatedAt?: string }): Promise<unknown | null> {
    const result = await this.db.query(`
      UPDATE analysis_functions SET name=COALESCE($2,name),description=CASE WHEN $3::boolean THEN $4 ELSE description END
      WHERE id=$1 AND is_system=false AND ($5::timestamptz IS NULL OR updated_at=$5::timestamptz)
      RETURNING *
    `, [id, input.name ?? null, Object.hasOwn(input, 'description'), input.description ?? null, input.expectedUpdatedAt ?? null]);
    return result.rows[0] ?? null;
  }

  async getFunctionDefinition(id: string): Promise<{ id: string; functionKey: string; functionKind: string; isSystem: boolean } | null> {
    const result = await this.db.query<{ id: string; function_key: string; function_kind: string; is_system: boolean }>('SELECT id,function_key,function_kind,is_system FROM analysis_functions WHERE id=$1', [id]);
    const row = result.rows[0];
    return row ? { id: row.id, functionKey: row.function_key, functionKind: row.function_kind, isSystem: row.is_system } : null;
  }

  async resolveFunctionBindings(bindings: FunctionBindingDraft[]): Promise<Array<FunctionBindingDraft & { functionKey: string; functionKind: string; sourceBody: string }>> {
    const resolved: Array<FunctionBindingDraft & { functionKey: string; functionKind: string; sourceBody: string }> = [];
    for (const binding of bindings) {
      const result = await this.db.query<{ function_key: string; function_kind: string; source_body: string }>(`
        SELECT f.function_key,f.function_kind,fr.source_body
        FROM analysis_function_revisions fr JOIN analysis_functions f ON f.id=fr.function_id
        WHERE fr.id=$1 AND fr.validation_status='passed' AND f.published_revision_id=fr.id
      `, [binding.functionRevisionId]);
      const row = result.rows[0];
      if (!row) throw new Error(`Function binding ${binding.alias} must reference a published passed revision`);
      resolved.push({ ...binding, functionKey: row.function_key, functionKind: row.function_kind, sourceBody: row.source_body });
    }
    return resolved;
  }

  async duplicateFunction(id: string): Promise<unknown | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const sourceResult = await client.query<{
        function_key: string; name: string; description: string | null; function_kind: string;
        draft_revision_id: string | null; published_revision_id: string | null;
      }>('SELECT function_key,name,description,function_kind,draft_revision_id,published_revision_id FROM analysis_functions WHERE id=$1 FOR SHARE', [id]);
      const source = sourceResult.rows[0];
      if (!source) { await client.query('ROLLBACK'); return null; }
      const suffix = Math.random().toString(36).slice(2, 10);
      const key = `${source.function_key.slice(0, 49)}-copy-${suffix}`;
      const created = await client.query<{ id: string }>(`INSERT INTO analysis_functions(function_key,name,description,function_kind,is_system) VALUES ($1,$2,$3,$4,false) RETURNING id`, [key, `${source.name} copy`, source.description, source.function_kind]);
      const functionId = created.rows[0]!.id;
      const sourceRevisionId = source.published_revision_id ?? source.draft_revision_id;
      if (sourceRevisionId) {
        const revision = await client.query<{ id: string; validation_status: string }>(`
          INSERT INTO analysis_function_revisions(function_id,revision,sdk_version,source_body,parameter_schema,default_options,output_metadata,source_hash,validation_status,validation_report,validated_at)
          SELECT $1,1,sdk_version,source_body,parameter_schema,default_options,output_metadata,source_hash,validation_status,validation_report,validated_at
          FROM analysis_function_revisions WHERE id=$2 RETURNING id,validation_status
        `, [functionId, sourceRevisionId]);
        const copied = revision.rows[0];
        if (copied) await client.query(`UPDATE analysis_functions SET draft_revision_id=$2,published_revision_id=CASE WHEN $3::boolean AND $4='passed' THEN $2 ELSE NULL END WHERE id=$1`, [functionId, copied.id, source.published_revision_id === sourceRevisionId, copied.validation_status]);
      }
      await client.query('COMMIT');
      return (await this.db.query('SELECT * FROM analysis_functions WHERE id=$1', [functionId])).rows[0] ?? null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async createFunctionRevision(functionId: string, draft: { sourceBody: string; parameterSchema?: unknown; defaultOptions?: unknown; outputMetadata?: unknown; sourceHash: string; validationStatus: string; validationReport: unknown }): Promise<unknown> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; revision: number }>(`
        INSERT INTO analysis_function_revisions(function_id,revision,source_body,parameter_schema,default_options,output_metadata,source_hash,validation_status,validation_report,validated_at)
        SELECT $1,COALESCE(MAX(revision),0)+1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,now()
        FROM analysis_function_revisions WHERE function_id=$1 RETURNING id,revision
      `, [functionId, draft.sourceBody, JSON.stringify(draft.parameterSchema ?? {}), JSON.stringify(draft.defaultOptions ?? {}), JSON.stringify(draft.outputMetadata ?? {}), draft.sourceHash, draft.validationStatus, JSON.stringify(draft.validationReport)]);
      const revision = result.rows[0];
      if (!revision) throw new Error('Could not create function revision');
      await client.query('UPDATE analysis_functions SET draft_revision_id=$2 WHERE id=$1', [functionId, revision.id]);
      await client.query('COMMIT');
      return revision;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async publishFunctionRevision(functionId: string, revisionId: string): Promise<unknown | null> {
    const result = await this.db.query(`UPDATE analysis_functions f SET published_revision_id=r.id FROM analysis_function_revisions r WHERE f.id=$1 AND r.id=$2 AND r.function_id=f.id AND r.validation_status='passed' RETURNING f.*`, [functionId, revisionId]);
    return result.rows[0] ?? null;
  }

  async deleteFunction(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM analysis_functions WHERE id=$1 AND is_system=false', [id]);
    return result.rowCount === 1;
  }

  async listExplorations(): Promise<unknown[]> {
    return (await this.db.query(`SELECT e.*, p.name AS program_name FROM explorations e JOIN analysis_programs p ON p.id=e.program_id ORDER BY e.updated_at DESC`)).rows;
  }
  async createExploration(input: { programId: string; autoRun?: boolean; editorPreferences?: unknown }): Promise<unknown> {
    return (await this.db.query('INSERT INTO explorations(program_id,auto_run,editor_preferences) VALUES ($1,$2,$3::jsonb) RETURNING *', [input.programId, input.autoRun ?? true, JSON.stringify(input.editorPreferences ?? {})])).rows[0];
  }
  async getExploration(id: string): Promise<unknown | null> {
    const result = await this.db.query(`SELECT e.*, row_to_json(p) AS program FROM explorations e JOIN analysis_programs p ON p.id=e.program_id WHERE e.id=$1`, [id]);
    return result.rows[0] ?? null;
  }
  async updateExploration(id: string, input: { autoRun?: boolean; editorPreferences?: unknown; expectedUpdatedAt?: string }): Promise<unknown | null> {
    const result = await this.db.query(`UPDATE explorations SET auto_run=COALESCE($2,auto_run), editor_preferences=COALESCE($3::jsonb,editor_preferences) WHERE id=$1 AND ($4::timestamptz IS NULL OR updated_at=$4::timestamptz) RETURNING *`, [id, input.autoRun ?? null, input.editorPreferences === undefined ? null : JSON.stringify(input.editorPreferences), input.expectedUpdatedAt ?? null]);
    return result.rows[0] ?? null;
  }
  async deleteExploration(id: string): Promise<boolean> { return (await this.db.query('DELETE FROM explorations WHERE id=$1', [id])).rowCount === 1; }
}
