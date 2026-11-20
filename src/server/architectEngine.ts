import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ApiEndpointSpec,
  ArchitectureDiagram,
  ArchitectureModuleSpec,
  ArchitecturePlan,
  DatabaseSchemaTable,
  TechRecommendation,
} from '../types/mideocode.ts';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface GeneratedArchitecturePayload {
  title: string;
  overview: string;
  frontendSpec: string;
  backendSpec: string;
  authSpec: string;
  techStack: TechRecommendation[];
  modules: ArchitectureModuleSpec[];
  databaseTables: DatabaseSchemaTable[];
  apiEndpoints: ApiEndpointSpec[];
  diagrams: ArchitectureDiagram[];
}

const ARCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    overview: { type: Type.STRING },
    frontendSpec: { type: Type.STRING },
    backendSpec: { type: Type.STRING },
    authSpec: { type: Type.STRING },
    techStack: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          layer: {
            type: Type.STRING,
            enum: ['Frontend', 'Backend', 'Database', 'Authentication', 'Testing', 'Deployment'],
          },
          choice: { type: Type.STRING },
          rationale: { type: Type.STRING },
        },
        required: ['layer', 'choice', 'rationale'],
      },
    },
    modules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          purpose: { type: Type.STRING },
          folderPath: { type: Type.STRING },
          dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
          keyFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['id', 'name', 'purpose', 'folderPath', 'dependencies', 'keyFiles'],
      },
    },
    databaseTables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          indexes: { type: Type.ARRAY, items: { type: Type.STRING } },
          fields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                nullable: { type: Type.BOOLEAN },
                isPrimaryKey: { type: Type.BOOLEAN },
                isForeignKey: { type: Type.BOOLEAN },
                references: { type: Type.STRING },
                unique: { type: Type.BOOLEAN },
                constraints: { type: Type.STRING },
              },
              required: ['name', 'type', 'nullable'],
            },
          },
        },
        required: ['id', 'name', 'description', 'fields', 'indexes'],
      },
    },
    apiEndpoints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          method: { type: Type.STRING, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          path: { type: Type.STRING },
          summary: { type: Type.STRING },
          authRequired: { type: Type.BOOLEAN },
          roleRequirement: { type: Type.STRING },
          requestSchema: { type: Type.STRING },
          responseSchema: { type: Type.STRING },
          validationRules: { type: Type.ARRAY, items: { type: Type.STRING } },
          errorResponses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.NUMBER },
                code: { type: Type.STRING },
                message: { type: Type.STRING },
              },
              required: ['status', 'code', 'message'],
            },
          },
        },
        required: ['id', 'method', 'path', 'summary', 'authRequired', 'requestSchema', 'responseSchema', 'validationRules', 'errorResponses'],
      },
    },
    diagrams: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ['system', 'er', 'workflow', 'journey', 'api', 'component', 'dataflow'],
          },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                sublabel: { type: Type.STRING },
                layer: {
                  type: Type.STRING,
                  enum: ['client', 'api', 'service', 'data', 'external', 'auth'],
                },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
              },
              required: ['id', 'label', 'layer', 'x', 'y'],
            },
          },
          edges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                from: { type: Type.STRING },
                to: { type: Type.STRING },
                label: { type: Type.STRING },
              },
              required: ['id', 'from', 'to', 'label'],
            },
          },
        },
        required: ['kind', 'title', 'summary', 'nodes', 'edges'],
      },
    },
  },
  required: [
    'title',
    'overview',
    'frontendSpec',
    'backendSpec',
    'authSpec',
    'techStack',
    'modules',
    'databaseTables',
    'apiEndpoints',
    'diagrams',
  ],
};

function normalizeDiagramCoords(diagrams: ArchitectureDiagram[]): ArchitectureDiagram[] {
  const requiredKinds: ArchitectureDiagram['kind'][] = [
    'system',
    'er',
    'workflow',
    'journey',
    'api',
    'component',
    'dataflow',
  ];

  const byKind = new Map<ArchitectureDiagram['kind'], ArchitectureDiagram>();
  for (const d of diagrams || []) {
    if (d && d.kind) {
      const nodes = (d.nodes || []).map((n, idx) => ({
        ...n,
        x: typeof n.x === 'number' && Number.isFinite(n.x) ? Math.max(40, Math.min(760, n.x)) : 90 + (idx % 3) * 240,
        y: typeof n.y === 'number' && Number.isFinite(n.y) ? Math.max(40, Math.min(400, n.y)) : 70 + Math.floor(idx / 3) * 140,
      }));
      byKind.set(d.kind, { ...d, nodes, edges: d.edges || [] });
    }
  }

  for (const kind of requiredKinds) {
    if (!byKind.has(kind)) {
      byKind.set(kind, {
        kind,
        title: `${kind.toUpperCase()} View`,
        summary: `Architecture perspective for ${kind}`,
        nodes: [],
        edges: [],
      });
    }
  }

  return requiredKinds.map((k) => byKind.get(k)!);
}

export async function generateArchitectureWithAi(input: {
  prompt: string;
  constraints?: string;
}): Promise<GeneratedArchitecturePayload> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on this server. Architect AI requires a valid API key.');
  }

  const prompt = `You are a Principal Software Architect designing a complete, production-ready technical blueprint for the user's application idea.

USER IDEA / PROMPT:
${input.prompt}
${input.constraints ? `\nCONSTRAINTS & PREFERENCES:\n${input.constraints}` : ''}

REQUIREMENTS:
1. Propose clear application structure, frontend architecture, backend architecture, database schema (tables/collections, fields, PK, FK, indexes), authentication & authorization model, API endpoints (with req/res JSON shapes, validation rules, error responses), modules (folder paths and key files), and concrete technology stack recommendations with explicit technical rationales.
2. Produce ALL 7 visual diagram definitions inside "diagrams":
   - "system": System architecture overview
   - "er": Database / entity relationship diagram
   - "workflow": Core user & system workflow
   - "journey": End-to-end user journey flow
   - "api": API request/response & auth flow
   - "component": Frontend/backend module & component dependency graph
   - "dataflow": Data ingestion, processing & persistence flow
3. In each diagram, position nodes nicely inside a 840x440 canvas (x in [60..700], y in [50..360]) without overlapping nodes.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: 'application/json',
      responseSchema: ARCH_RESPONSE_SCHEMA,
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Architect AI returned an empty response.');
  }

  const parsed = JSON.parse(rawText) as GeneratedArchitecturePayload;
  return {
    ...parsed,
    diagrams: normalizeDiagramCoords(parsed.diagrams),
  };
}

export async function reviseArchitectureWithAi(input: {
  currentPlan: Omit<ArchitecturePlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
  revisionPrompt: string;
}): Promise<GeneratedArchitecturePayload> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on this server.');
  }

  const prompt = `Revise the existing software architecture plan cleanly according to the user's instruction while preserving unaffected sections.

CURRENT ARCHITECTURE JSON:
${JSON.stringify({
  title: input.currentPlan.title,
  overview: input.currentPlan.overview,
  frontendSpec: input.currentPlan.frontendSpec,
  backendSpec: input.currentPlan.backendSpec,
  authSpec: input.currentPlan.authSpec,
  techStack: input.currentPlan.techStack,
  modules: input.currentPlan.modules,
  databaseTables: input.currentPlan.databaseTables,
  apiEndpoints: input.currentPlan.apiEndpoints,
  diagrams: input.currentPlan.diagrams,
}).slice(0, 24000)}

USER REVISION REQUEST:
${input.revisionPrompt}

Return the complete updated architecture object adhering strictly to the schema and preserving all 7 diagram kinds (system, er, workflow, journey, api, component, dataflow).`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: 'application/json',
      responseSchema: ARCH_RESPONSE_SCHEMA,
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Architect AI revision returned an empty response.');
  }
  const parsed = JSON.parse(rawText) as GeneratedArchitecturePayload;
  return {
    ...parsed,
    diagrams: normalizeDiagramCoords(parsed.diagrams),
  };
}

export function exportDatabaseSqlDdl(tables: DatabaseSchemaTable[]): string {
  const lines: string[] = [
    '-- Generated by MideoCode Architect Database Designer',
    `-- Generated at ${new Date().toISOString()}`,
    '',
  ];

  for (const table of tables) {
    const safeTable = table.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    lines.push(`-- ${table.description || table.name}`);
    lines.push(`CREATE TABLE IF NOT EXISTS ${safeTable} (`);
    const colDefs: string[] = [];
    for (const f of table.fields) {
      const safeCol = f.name.replace(/[^a-zA-Z0-9_]/g, '_');
      const parts = [`  ${safeCol} ${f.type.toUpperCase()}`];
      if (f.isPrimaryKey) parts.push('PRIMARY KEY');
      if (!f.nullable && !f.isPrimaryKey) parts.push('NOT NULL');
      if (f.unique) parts.push('UNIQUE');
      if (f.isForeignKey && f.references) {
        parts.push(`REFERENCES ${f.references}`);
      }
      colDefs.push(parts.join(' '));
    }
    lines.push(colDefs.join(',\n'));
    lines.push(');');

    for (const idx of table.indexes || []) {
      const idxSafe = idx.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      lines.push(`CREATE INDEX IF NOT EXISTS idx_${safeTable}_${idxSafe} ON ${safeTable} (${idxSafe});`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function exportOpenApiSpecJson(plan: {
  title: string;
  overview: string;
  versionNumber: number;
  apiEndpoints: ApiEndpointSpec[];
}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of plan.apiEndpoints) {
    const cleanPath = ep.path.startsWith('/') ? ep.path : `/${ep.path}`;
    if (!paths[cleanPath]) paths[cleanPath] = {};
    const methodLower = ep.method.toLowerCase();
    const responses: Record<string, unknown> = {
      '200': {
        description: ep.summary || 'Success',
        content: {
          'application/json': {
            example: ep.responseSchema,
          },
        },
      },
    };
    for (const err of ep.errorResponses || []) {
      responses[String(err.status)] = {
        description: `${err.code}: ${err.message}`,
      };
    }

    const op: Record<string, unknown> = {
      summary: ep.summary,
      security: ep.authRequired ? [{ bearerAuth: [] }] : [],
      responses,
    };

    if (ep.method !== 'GET' && ep.requestSchema) {
      op.requestBody = {
        required: true,
        content: {
          'application/json': {
            example: ep.requestSchema,
          },
        },
      };
    }

    paths[cleanPath][methodLower] = op;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: plan.title,
      description: plan.overview,
      version: `${plan.versionNumber}.0.0`,
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    paths,
  };
}
