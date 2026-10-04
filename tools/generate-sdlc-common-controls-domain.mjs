#!/usr/bin/env node
/**
 * Generates the `finos-sdlc-common-controls` CALM Hub control domain, and the Standard its documents
 * conform to, from a checkout of the FINOS SDLC Common Controls Catalog
 * (https://github.com/finos/sdlc-common-controls).
 *
 * Two outputs, following the Standards and Controls integration described at
 * https://calm.finos.org/core-concepts/standards/#standards-and-controls-integration:
 *   - one CALM Standard, `sdlc-control-requirement`, which is the JSON Schema every control
 *     requirement document of the catalog conforms to (identity, summary, phase, provenance, the
 *     risks it mitigates, its requirement statements, its standards references, and the keywords
 *     that pin `control-id` and `name` for any architecture that cites the document); and
 *   - one control requirement document per catalog mitigation, each declaring that Standard as its
 *     `$schema`. A document is both a readable catalog entry and a JSON Schema extending CALM's
 *     control-requirement meta schema, so an architecture that cites it as a `requirement-url` has
 *     its control config validated: `control-id` and `name` are pinned to the catalog's values and
 *     `description` must say how the control is met. Implementation parameters are left to the
 *     pattern an organisation validates its architectures against.
 * Every document is validated against the Standard before it is written.
 *
 * Output matches the shape the hub seeders read from calm-hub/mongo/controls/<domain>/:
 *   { controlId, name, description, requirement: { "1-0-0": <document> }, configurations: [] }
 * The seed `name` is the control's slug, so the name-based URL in each document's `$id`
 * resolves after seeding (MappingControllerService resolves control names case-insensitively).
 * The Standard goes to calm-hub/mongo/standards/<namespace>/, which the Nitrite seeder posts
 * through the name-based API.
 *
 * This script lives in the blueprint until the catalog project adopts it; the hub repository holds only the
 * generated documents. Run it from a checkout of finos/architecture-as-code so the default output paths resolve:
 *   node <blueprint>/tools/generate-sdlc-common-controls-domain.mjs --catalog <path to sdlc-common-controls checkout>
 *       [--out calm-hub/mongo/controls/finos-sdlc-common-controls]
 *       [--standards-out calm-hub/mongo/standards/finos.sdlc-common-controls]
 *       [--domain finos-sdlc-common-controls] [--hub-base https://hub.calm.finos.org]
 *       [--standard-id <url>] [--first-id 19] [--documents-out <dir>]
 *
 * --documents-out additionally writes the bare requirement documents (no seed wrapper), which is
 * what `calm hub push control-requirement <file>` expects.
 */
import {
    readFileSync,
    writeFileSync,
    readdirSync,
    mkdirSync,
    rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, arr) => {
        if (a.startsWith('--'))
            acc.push([
                a.slice(2),
                arr[i + 1] && !arr[i + 1].startsWith('--')
                    ? arr[i + 1]
                    : 'true',
            ]);
        return acc;
    }, [])
);
if (!args.catalog) {
    console.error(
        'usage: --catalog <path to a checkout of finos/sdlc-common-controls> [--out <dir>] [--standards-out <dir>] [--domain <name>] [--hub-base <url>] [--standard-id <url>] [--first-id <n>] [--documents-out <dir>]'
    );
    process.exit(2);
}
const CATALOG = args.catalog;
const OUT = args.out ?? 'calm-hub/mongo/controls/finos-sdlc-common-controls';
const STANDARDS_OUT =
    args['standards-out'] ?? 'calm-hub/mongo/standards/finos.sdlc-common-controls';
const DOMAIN = args.domain ?? 'finos-sdlc-common-controls';
const HUB_BASE = (args['hub-base'] ?? 'https://hub.calm.finos.org').replace(
    /\/$/,
    ''
);
const STANDARD_ID =
    args['standard-id'] ??
    `${HUB_BASE}/calm/namespaces/finos.sdlc-common-controls/standards/sdlc-control-requirement/versions/1.0.0`;
const FIRST_ID = Number(args['first-id'] ?? 19);
if (!Number.isInteger(FIRST_ID) || FIRST_ID < 1) {
    console.error(
        `--first-id must be a positive integer, got ${args['first-id']}`
    );
    process.exit(2);
}
const DOCS_OUT = args['documents-out'];
const SITE = 'https://finos.github.io/sdlc-common-controls';
const REPO = 'https://github.com/finos/sdlc-common-controls';
const META = 'https://calm.finos.org/release/1.2/meta/control-requirement.json';
const PHASES = ['META', 'LIFECYCLE', 'CODE', 'BUILD', 'RELEASE', 'RUNTIME'];

// ---- provenance -------------------------------------------------------------------------------
const git = (...a) =>
    execFileSync('git', ['-C', CATALOG, ...a], { encoding: 'utf8' }).trim();
let revision = 'unknown',
    revisionDate = 'unknown';
try {
    revision = git('rev-parse', 'HEAD');
    revisionDate = git('log', '-1', '--format=%cs');
} catch {
    /* not a git checkout */
}

// ---- the Standard: what every control requirement document of the catalog carries --------------
const text = (description) => ({ type: 'string', minLength: 1, description });
const statements = (description) => ({
    type: 'array',
    description,
    items: {
        oneOf: [
            { type: 'string', minLength: 1 },
            {
                type: 'object',
                properties: {
                    text: { type: 'string', minLength: 1 },
                    items: { type: 'array', items: { type: 'string' } },
                },
                required: ['text', 'items'],
            },
        ],
    },
});
const reference = {
    type: 'object',
    properties: {
        id: text('Identifier of the clause or document in that framework'),
        title: { type: 'string' },
        url: { type: 'string', pattern: '^https?://' },
        note: {
            type: 'string',
            description: 'Why the catalog cites it for this control',
        },
    },
    required: ['id'],
};
const standard = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: STANDARD_ID,
    title: 'SDLC Common Controls control requirement',
    description:
        'What every control requirement document of the FINOS SDLC Common Controls Catalog carries. Each document in the finos-sdlc-common-controls control domain declares this Standard as its $schema. A document is a readable catalog entry and a JSON Schema: an architecture that cites it as a requirement-url has its control config validated against it, with control-id and name pinned to the catalog.',
    allOf: [{ $ref: 'https://json-schema.org/draft/2020-12/schema' }],
    type: 'object',
    properties: {
        $schema: {
            const: STANDARD_ID,
            description: 'Every document declares this Standard',
        },
        $id: {
            type: 'string',
            pattern: '^https?://',
            description:
                'Where CALM Hub serves the document: .../calm/domains/<domain>/controls/<slug>/requirement/versions/<version>',
        },
        title: text('Control id and name, for example "SDLC-PREV-017 Service Dependency Control"'),
        name: text("The catalog's name for the control"),
        description: text("The catalog's summary of the control"),
        'control-id': {
            type: 'string',
            pattern: '^SDLC-[A-Z]+-[0-9]{3}$',
            description:
                "The catalog's identifier: SDLC, the control type, a three digit sequence",
        },
        category: {
            enum: PHASES,
            description: 'The SDLC phase the catalog places the control in',
        },
        source: { const: 'FINOS SDLC Common Controls Catalog' },
        url: {
            type: 'string',
            pattern: '^https?://',
            description: "The control's page on the catalog site",
        },
        catalog: {
            type: 'object',
            description: 'Provenance: which revision of the catalog this document was generated from',
            properties: {
                repository: { type: 'string', pattern: '^https?://' },
                revision: text('Commit of the catalog source'),
                'revision-date': { type: 'string' },
                sequence: { type: 'integer', minimum: 1 },
                'control-type': { type: 'string', pattern: '^[A-Z]+$' },
                phase: { enum: PHASES },
                status: text("The catalog's approval status for the control"),
                chain: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'The control chains the catalog places it in, when any',
                },
            },
            required: [
                'repository',
                'revision',
                'revision-date',
                'sequence',
                'control-type',
                'status',
            ],
        },
        mitigates: {
            type: 'array',
            minItems: 1,
            description: 'The catalog risks this control mitigates',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string', pattern: '^SDLC-[A-Z]+-[0-9]{3}$' },
                    name: { type: 'string' },
                    url: { type: 'string', pattern: '^https?://' },
                },
                required: ['id'],
            },
        },
        'related-controls': {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    url: { type: 'string', pattern: '^https?://' },
                },
                required: ['id'],
            },
        },
        details: {
            type: 'array',
            items: { type: 'string' },
            description: "The catalog's description, one paragraph per item",
        },
        requirements: {
            ...statements("The catalog's requirement statements, MUST and SHOULD"),
            minItems: 1,
        },
        examples: statements("The catalog's examples and commentary"),
        references: {
            type: 'object',
            description: 'Standards and regulatory references, keyed by framework, plus the page links',
            properties: {
                links: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            url: { type: 'string', pattern: '^https?://' },
                        },
                        required: ['title', 'url'],
                    },
                },
            },
            additionalProperties: { type: 'array', items: reference },
        },
        // The schema half of a document: what an architecture's control config must satisfy.
        type: { const: 'object' },
        allOf: {
            type: 'array',
            contains: { properties: { $ref: { const: META } }, required: ['$ref'] },
            description: "Extends CALM's control-requirement meta schema",
        },
        properties: {
            type: 'object',
            properties: {
                'control-id': {
                    type: 'object',
                    properties: { const: { type: 'string', pattern: '^SDLC-[A-Z]+-[0-9]{3}$' } },
                    required: ['const'],
                },
                name: {
                    type: 'object',
                    properties: { const: { type: 'string', minLength: 1 } },
                    required: ['const'],
                },
                description: { type: 'object' },
            },
            required: ['control-id', 'name', 'description'],
            description: 'Pins control-id and name to the catalog; description says how the control is met',
        },
        required: {
            type: 'array',
            allOf: [
                { contains: { const: 'control-id' } },
                { contains: { const: 'name' } },
                { contains: { const: 'description' } },
            ],
        },
    },
    required: [
        '$schema',
        '$id',
        'title',
        'name',
        'description',
        'control-id',
        'source',
        'url',
        'catalog',
        'mitigates',
        'requirements',
        'type',
        'allOf',
        'properties',
        'required',
    ],
};
const ajv = new Ajv2020({ strict: false, allErrors: true });
const conforms = ajv.compile(standard);

// ---- helpers ----------------------------------------------------------------------------------
const frontMatter = (text) => {
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error('no front matter');
    return { data: yaml.load(m[1]), body: m[2] };
};
const sections = (body) => {
    const out = {};
    const parts = body.split(/^## (.+)$/m);
    for (let i = 1; i < parts.length; i += 2)
        out[parts[i].trim()] = parts[i + 1].trim();
    return out;
};
const pageUrl = (collection, file) =>
    `${SITE}/${collection}/${file.replace(/\.md$/, '.html')}`;
const slugOf = (file) => file.replace(/\.md$/, '');
// Markdown and Jekyll to plain text. Links keep their target in brackets so nothing is lost.
const clean = (s) =>
    s
        .replace(/\{%\s*link\s+_mitigations\/([^\s%]+)\s*%\}/g, (_, f) =>
            pageUrl('mitigations', f)
        )
        .replace(/\{%\s*link\s+_risks\/([^\s%]+)\s*%\}/g, (_, f) =>
            pageUrl('risks', f)
        )
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
const paragraphs = (s) =>
    s
        .split(/\n\s*\n/)
        .map(clean)
        .filter(Boolean);
// Bulleted or numbered list with one level of nesting. Items with children become { text, items }.
const listItems = (text) => {
    const items = [];
    let current = null;
    for (const line of text.split('\n')) {
        const m = line.match(/^(\s*)(?:[*-]|\d+\.)\s+(.*)$/);
        if (!m) {
            if (current && line.trim() && !line.trim().startsWith('#'))
                current.text += ' ' + line.trim();
            continue;
        }
        const indent = m[1].length;
        if (indent === 0) {
            current = { text: m[2].trim(), items: [] };
            items.push(current);
        } else if (current) current.items.push(m[2].trim());
    }
    return items.map((i) =>
        i.items.length
            ? { text: clean(i.text), items: i.items.map(clean) }
            : clean(i.text)
    );
};
const links = (text) =>
    [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => ({
        title: clean(m[1]),
        url: m[2],
    }));
const pad = (n) => String(n).padStart(3, '0');
const idOf = (data) => `SDLC-${data.type}-${pad(data.sequence)}`;

// ---- reference data: framework id -> { title, url } --------------------------------------------
const dataDir = join(CATALOG, 'docs', '_data');
const frameworks = {};
for (const f of readdirSync(dataDir).filter(
    (f) => f.endsWith('.yml') && f !== 'glossary.yml'
)) {
    frameworks[f.replace(/\.yml$/, '')] =
        yaml.load(readFileSync(join(dataDir, f), 'utf8')) ?? {};
}
const enrich = (framework, refs) =>
    (refs ?? []).map((r) => {
        const id = typeof r === 'string' ? r : r.id;
        const known = frameworks[framework]?.[id] ?? {};
        const out = {
            id,
            ...(known.title ? { title: known.title } : {}),
            ...(known.url ? { url: known.url } : {}),
        };
        if (typeof r === 'object' && r.note) out.note = clean(String(r.note));
        return out;
    });

// ---- risks ------------------------------------------------------------------------------------
const risks = {};
for (const f of readdirSync(join(CATALOG, 'docs', '_risks')).filter((f) =>
    f.endsWith('.md')
)) {
    const { data } = frontMatter(
        readFileSync(join(CATALOG, 'docs', '_risks', f), 'utf8')
    );
    risks[f.split('_')[0]] = {
        id: idOf(data),
        name: data.title,
        url: pageUrl('risks', f),
    };
}

// ---- mitigations ------------------------------------------------------------------------------
const mitigationFiles = readdirSync(
    join(CATALOG, 'docs', '_mitigations')
).filter((f) => f.endsWith('.md'));
const mitigations = mitigationFiles
    .map((f) => {
        const { data, body } = frontMatter(
            readFileSync(join(CATALOG, 'docs', '_mitigations', f), 'utf8')
        );
        return { file: f, data, sections: sections(body) };
    })
    .sort((a, b) => a.data.sequence - b.data.sequence);
const mitigationRef = (key) => {
    const file = mitigationFiles.find(
        (f) => f.startsWith(`${key}_`) || f.startsWith(`${key}-`)
    );
    if (!file) return { id: key };
    const { data } = frontMatter(
        readFileSync(join(CATALOG, 'docs', '_mitigations', file), 'utf8')
    );
    return {
        id: idOf(data),
        name: data.title,
        url: pageUrl('mitigations', file),
    };
};

mkdirSync(OUT, { recursive: true });
for (const stale of readdirSync(OUT).filter((f) => f.endsWith('.json')))
    rmSync(join(OUT, stale));
mkdirSync(STANDARDS_OUT, { recursive: true });
if (DOCS_OUT) mkdirSync(DOCS_OUT, { recursive: true });

const index = [];
let invalid = 0;
mitigations.forEach(({ file, data, sections: sec }, i) => {
    const id = idOf(data);
    const slug = `${id.toLowerCase()}-${slugOf(file).replace(/^mi-\d+[_-]/, '')}`;
    const controlId = FIRST_ID + i;
    const summary = paragraphs(sec.Summary ?? '');
    const references = {};
    for (const key of Object.keys(data).filter((k) =>
        k.endsWith('_references')
    )) {
        const framework = key.replace(/_references$/, '');
        references[framework] = enrich(framework, data[key]);
    }
    const pageLinks = links(sec.Links ?? '');
    if (pageLinks.length) references.links = pageLinks;

    const document = {
        $schema: STANDARD_ID,
        $id: `${HUB_BASE}/calm/domains/${DOMAIN}/controls/${slug}/requirement/versions/1.0.0`,
        title: `${id} ${data.title}`,
        name: data.title,
        description: summary.join('\n\n'),
        'control-id': id,
        ...(data.phase ? { category: data.phase } : {}),
        source: 'FINOS SDLC Common Controls Catalog',
        url: pageUrl('mitigations', file),
        catalog: {
            repository: REPO,
            revision,
            'revision-date': revisionDate,
            sequence: data.sequence,
            'control-type': data.type,
            ...(data.phase ? { phase: data.phase } : {}),
            status: data['doc-status'],
            ...(data.chain ? { chain: data.chain } : {}),
        },
        mitigates: (data.mitigates ?? []).map((r) => risks[r] ?? { id: r }),
        ...(data.related_mitigations
            ? {
                  'related-controls':
                      data.related_mitigations.map(mitigationRef),
              }
            : {}),
        details: paragraphs(sec.Description ?? ''),
        requirements: listItems(sec.Requirements ?? ''),
        examples: listItems(sec['Examples & Commentary'] ?? sec.Examples ?? ''),
        references,
        type: 'object',
        allOf: [{ $ref: META }],
        properties: {
            'control-id': { const: id },
            name: { const: data.title },
            description: {
                type: 'string',
                description:
                    'How this architecture meets the control: what is in place and where it is enforced.',
            },
        },
        required: ['control-id', 'name', 'description'],
    };
    if (!conforms(document)) {
        invalid++;
        console.error(
            `${id} does not conform to the Standard:\n  ${ajv.errorsText(conforms.errors, { separator: '\n  ' })}`
        );
    }

    const seed = {
        controlId,
        name: slug,
        description: summary[0] ?? data.title,
        requirement: { '1-0-0': document },
        configurations: [],
    };
    writeFileSync(
        join(OUT, `${pad(controlId)}-${slug}.json`),
        JSON.stringify(seed, null, 2) + '\n'
    );
    if (DOCS_OUT)
        writeFileSync(
            join(DOCS_OUT, `${slug}.json`),
            JSON.stringify(document, null, 2) + '\n'
        );
    index.push({
        controlId,
        id,
        name: data.title,
        slug,
        phase: data.phase ?? null,
        status: data['doc-status'],
        requirements: document.requirements.length,
        mitigates: document.mitigates.map((m) => m.id),
    });
});
if (invalid) {
    console.error(`${invalid} document(s) do not conform to the Standard; nothing else written`);
    process.exit(1);
}
writeFileSync(
    join(STANDARDS_OUT, 'sdlc-control-requirement.standard.json'),
    JSON.stringify(standard, null, 2) + '\n'
);

const readme = `# finos-sdlc-common-controls

The [FINOS SDLC Common Controls Catalog](${SITE}) as a CALM Hub control domain: one control requirement per
catalog mitigation, ${index.length} in all, generated from the catalog's source at
[${revision.slice(0, 12)}](${REPO}/tree/${revision}) (${revisionDate}).

Every document declares the catalog's Standard as its \`$schema\`:

    ${STANDARD_ID}

The Standard (\`${STANDARDS_OUT}/\`) is the JSON Schema each document conforms to: identity, summary, phase,
provenance, the risks it mitigates, its requirement statements, its standards references, and the keywords that pin
\`control-id\` and \`name\`. This is the Standards and Controls integration described at
https://calm.finos.org/core-concepts/standards/#standards-and-controls-integration: one Standard, many requirement
documents, each cited by architectures through \`requirement-url\`.

A document is therefore both a readable catalog entry and a JSON Schema that extends CALM's \`control-requirement\`
meta schema. An architecture that cites a document has its control config validated: \`control-id\` and \`name\` are
pinned to the catalog's values and \`description\` must say how the control is met. Implementation parameters belong
in the pattern an organisation validates its architectures against; the catalog does not prescribe them.

The seed \`name\` of each control is its slug, so the name-based URL in each document's \`$id\` resolves once seeded:

    ${HUB_BASE}/calm/domains/${DOMAIN}/controls/<slug>/requirement/versions/1.0.0

| controlId | control-id | name | phase | status |
| --- | --- | --- | --- | --- |
${index.map((r) => `| ${r.controlId} | ${r.id} | ${r.name} | ${r.phase ?? ''} | ${r.status} |`).join('\n')}

The documents are generated from the catalog's Jekyll source, one per \`docs/_mitigations/*.md\` page, and validated
against the Standard before they are committed; the generator belongs with the catalog's tooling, not here. To
refresh, regenerate from a newer catalog revision, replace the files, and bump \`controlStoreCounter\` in
\`calm-hub/mongo/init-mongo.js\` if the highest controlId changes.
`;
writeFileSync(join(OUT, 'README.md'), readme);
console.log(
    `wrote ${index.length} controls to ${OUT} (controlId ${FIRST_ID} to ${FIRST_ID + index.length - 1}) from catalog ${revision.slice(0, 12)} ${revisionDate}, all conforming to ${STANDARD_ID}`
);
for (const r of index)
    console.log(
        `  ${r.controlId}  ${r.id}  ${r.name}  [${r.phase ?? 'no phase'}, ${r.status}]  ${r.requirements} requirement(s), mitigates ${r.mitigates.join(' ')}`
    );
