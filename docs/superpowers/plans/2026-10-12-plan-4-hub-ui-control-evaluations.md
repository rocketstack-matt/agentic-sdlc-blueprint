# Plan 4: CALM Hub shows control evaluations on the diagram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an architecture version in CALM Hub carries `control-evaluation` decorators, the diagram shows each node's latest result (a green "Met" or red "Not met" badge, a red border when not met), turns a not-met relationship red, explains the result on hover, and lists every evaluation in the metadata panel. It refreshes on its own so a decision made by the gateway appears without a reload.

**Architecture:** One more decorator type fetched beside the deployment decorators, by the same exact-target query. A pure function turns the decorators into a map from element id to its latest result per control. A React context hands that map to `CustomNode` and `FloatingEdge` (the visualiser already uses contexts this way), so no graph-building code changes. A new `ControlEvaluationsPanel` joins the metadata panel's tabs.

**Tech Stack:** React 19, TypeScript, reactflow 11, Vitest + Testing Library, lucide-react icons, the visualiser's inline-style `THEME`. Playwright (in `../architecture-as-code/node_modules`) for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md` (Part 1 demo beats; Part 2, 2.5) and the decorator Standard in `../architecture-as-code/calm/draft/2026-03/standards/compliance/`.

**Repository:** `../architecture-as-code` (relative to this repository), `calm-hub-ui/`. Everything stays local: no push, no pull request (the owner raises PRs after reviewing the deck).

## Global Constraints

- Branch `feat/hub-ui-control-evaluations` from `main` in `../architecture-as-code` (independent of the Standard's branch). Never push.
- Follow `calm-hub-ui/AGENTS.md` and the root `AGENTS.md`: visualiser types go in `src/visualizer/contracts/*-contracts.ts`; scratch files in `sandbox/`; commands from the repository root with `--workspace calm-hub-ui`.
- Commit messages are conventional with scope `calm-hub-ui`: `feat(calm-hub-ui): …`, `test(calm-hub-ui): …`.
- Decorator JSON from the Hub has camelCase top-level keys (`uniqueId`, `appliesTo`, `targetType`, `schema`) and the Standard's kebab-case keys inside `data` (`evaluated-at`, `unique-id`, `control-id`, `requirement-url`).
- Statuses: `met`, `not-met`, `not-applicable`. A node's result is the latest evaluation per control that names it in `appliesTo` (latest by `data['evaluated-at']`); the node is "Not met" if any of those is `not-met`, "Met" if any is `met`, and shows nothing if all are `not-applicable` or there are none.
- Colours come from `THEME.colors.error` and `THEME.colors.success`; inline styles, as the visualiser does.
- Refresh interval for evaluations: 5 seconds (`EVALUATION_REFRESH_MS = 5000`), only while an architecture from the Hub is shown (not a dropped file).
- Do not change deployment decorators' behaviour.
- `npm test --workspace calm-hub-ui`, `npm run lint --workspace calm-hub-ui` and `npm run build --workspace calm-hub-ui` pass at the end.

## Review Focus

1. **Several decisions on one version for the same control and element** (a DENY then an ALLOW for the same change). Expect the newest to win. Pinned in Task 1.
2. **A decorator naming an element the diagram doesn't have** (a stale id, or a file path). Expect it ignored by the diagram and still listed in the panel. Pinned in Tasks 1 and 3.
3. **The Hub is unreachable or returns nothing.** Expect the diagram exactly as today: no badges, no panel tab, no errors. Pinned in Task 2 (service returns `[]`) and Task 3 (empty map renders nothing).
4. **A dropped file (not from the Hub).** Expect no fetch and no badges. Pinned in Task 4.
5. **Polling after the component unmounts or the version changes.** Expect the interval cleared and late responses ignored. Pinned in Task 4.

---

### Task 1: Types, the evaluation map and the service

**Files:**
- Modify: `calm-hub-ui/src/visualizer/contracts/decorator-contracts.ts`, `calm-hub-ui/src/visualizer/contracts/contracts.ts` (re-exports)
- Create: `calm-hub-ui/src/visualizer/components/reactflow/utils/controlEvaluations.ts` and `controlEvaluations.test.ts`
- Modify: `calm-hub-ui/src/service/calm-service.tsx` and `calm-service.test.tsx`

**Interfaces:**
- Produces: types `ControlEvaluationStatus`, `ControlEvaluationFinding`, `ControlEvaluationDecoratorData`, `ControlEvaluationDecorator`, `ElementEvaluation` (exported from `contracts.ts`); `evaluationsByElement(decorators: ControlEvaluationDecorator[]): Map<string, ElementEvaluation>`; `newestFirst(decorators): ControlEvaluationDecorator[]`; `CalmService.fetchControlEvaluationDecoratorsForArchitecture(namespace, id, version): Promise<Decorator[]>`.

- [ ] **Step 1: Branch**

```bash
cd ../architecture-as-code
git status --short            # must be empty apart from files you did not create
git switch main && git switch -c feat/hub-ui-control-evaluations
```

- [ ] **Step 2: Add the types**

Append to `src/visualizer/contracts/decorator-contracts.ts`:

```ts
export type ControlEvaluationStatus = 'met' | 'not-met' | 'not-applicable';

export interface ControlEvaluationFinding {
    subject: string;
    check?: string;
    description: string;
    expression?: string;
    cause?: string;
}

export interface ControlEvaluationDecoratorData extends DecoratorData {
    control: { 'unique-id': string; 'control-id'?: string; 'requirement-url': string; 'attached-to'?: string };
    status: ControlEvaluationStatus;
    'evaluated-at': string;
    change?: { commit: string; 'diff-sha256'?: string; spec?: string };
    findings?: ControlEvaluationFinding[];
    actors?: Record<string, string>;
    engine?: { name: string; version?: string; 'policy-sha256'?: string };
    'report-sha256'?: string;
    'report-uri'?: string;
}

export interface ControlEvaluationDecorator extends Decorator {
    type: 'control-evaluation';
    data: ControlEvaluationDecoratorData;
}

/** An element's latest evaluation per control, and the overall result shown on the diagram. */
export interface ElementEvaluation {
    status: 'met' | 'not-met';
    latest: ControlEvaluationDecorator[];
}
```

Re-export the five new names from `src/visualizer/contracts/contracts.ts` in the existing `decorator-contracts.js` export block.

- [ ] **Step 3: Write the failing tests for the map**

`src/visualizer/components/reactflow/utils/controlEvaluations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluationsByElement, newestFirst } from './controlEvaluations.js';
import type { ControlEvaluationDecorator } from '../../../contracts/contracts.js';

const d = (id: string, control: string, status: 'met' | 'not-met' | 'not-applicable', at: string, appliesTo: string[], extra = {}): ControlEvaluationDecorator => ({
    schema: 'https://calm.finos.org/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json',
    uniqueId: id,
    type: 'control-evaluation',
    target: ['/api/calm/namespaces/ns/architectures/1/versions/1-0-0'],
    appliesTo,
    data: { control: { 'unique-id': control, 'requirement-url': 'https://example.org/r' }, status, 'evaluated-at': at, ...extra },
});

describe('evaluationsByElement', () => {
    it('keeps the newest evaluation per control and element', () => {
        const map = evaluationsByElement([
            d('a', 'code-review', 'not-met', '2026-11-04T15:00:00.000Z', ['trade-api']),
            d('b', 'code-review', 'met', '2026-11-04T15:01:00.000Z', ['trade-api']),
        ]);
        expect(map.get('trade-api')?.status).toBe('met');
        expect(map.get('trade-api')?.latest.map((x) => x.uniqueId)).toEqual(['b']);
    });

    it('is not met when any control is not met', () => {
        const map = evaluationsByElement([
            d('a', 'code-review', 'met', '2026-11-04T15:00:00.000Z', ['trade-api']),
            d('b', 'client-ledger', 'not-met', '2026-11-04T15:00:00.000Z', ['trade-api', 'trade-api-to-client-ledger']),
        ]);
        expect(map.get('trade-api')?.status).toBe('not-met');
        expect(map.get('trade-api-to-client-ledger')?.status).toBe('not-met');
        expect(map.get('trade-api')?.latest.map((x) => x.uniqueId)).toEqual(['b', 'a']);
    });

    it('shows nothing for an element whose latest evaluations are all not applicable', () => {
        const map = evaluationsByElement([
            d('a', 'client-ledger', 'not-met', '2026-11-04T15:00:00.000Z', ['client-ledger']),
            d('b', 'client-ledger', 'not-applicable', '2026-11-04T15:05:00.000Z', ['client-ledger']),
        ]);
        expect(map.has('client-ledger')).toBe(false);
    });

    it('skips decorators without a control or a time, and ignores nothing else', () => {
        const broken = { ...d('x', 'c', 'not-met', '2026-11-04T15:00:00.000Z', ['n']), data: { status: 'not-met' } } as unknown as ControlEvaluationDecorator;
        const map = evaluationsByElement([broken, d('a', 'c', 'met', '2026-11-04T15:00:00.000Z', ['services/x.ts'])]);
        expect(map.has('n')).toBe(false);
        expect(map.get('services/x.ts')?.status).toBe('met');
    });
});

describe('newestFirst', () => {
    it('orders by evaluated-at, newest first', () => {
        const out = newestFirst([d('a', 'c', 'met', '2026-11-04T15:00:00.000Z', ['n']), d('b', 'c', 'met', '2026-11-04T15:02:00.000Z', ['n'])]);
        expect(out.map((x) => x.uniqueId)).toEqual(['b', 'a']);
    });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npm test --workspace calm-hub-ui -- controlEvaluations`
Expected: FAIL, module not found.

- [ ] **Step 5: Write the map**

`src/visualizer/components/reactflow/utils/controlEvaluations.ts`:

```ts
import type { ControlEvaluationDecorator, ElementEvaluation } from '../../../contracts/contracts.js';

const at = (d: ControlEvaluationDecorator) => d.data?.['evaluated-at'] ?? '';
const control = (d: ControlEvaluationDecorator) => d.data?.control?.['unique-id'];

/**
 * The result the diagram shows for each element: for every control that named the element in `appliesTo`, the
 * newest evaluation; the element is not met if any of those is not met, met if any is met. Elements whose newest
 * evaluations are all not applicable are left out, so they show nothing.
 */
export function evaluationsByElement(decorators: ControlEvaluationDecorator[]): Map<string, ElementEvaluation> {
    const newest = new Map<string, Map<string, ControlEvaluationDecorator>>();
    for (const d of decorators) {
        const key = control(d);
        if (!key || !at(d)) continue;
        for (const element of d.appliesTo ?? []) {
            const byControl = newest.get(element) ?? new Map<string, ControlEvaluationDecorator>();
            newest.set(element, byControl);
            const current = byControl.get(key);
            if (!current || at(current) < at(d)) byControl.set(key, d);
        }
    }
    const result = new Map<string, ElementEvaluation>();
    for (const [element, byControl] of newest) {
        const latest = [...byControl.values()]
            .filter((d) => d.data.status !== 'not-applicable')
            .sort((a, b) => (a.data.status === b.data.status ? control(a)!.localeCompare(control(b)!) : a.data.status === 'not-met' ? -1 : 1));
        if (!latest.length) continue;
        result.set(element, { status: latest.some((d) => d.data.status === 'not-met') ? 'not-met' : 'met', latest });
    }
    return result;
}

export const newestFirst = (decorators: ControlEvaluationDecorator[]) => [...decorators].sort((a, b) => at(b).localeCompare(at(a)));
```

The sort puts not-met evaluations first, so the hover panel leads with the reason; the second test above pins that order (`['b', 'a']`).

- [ ] **Step 6: The service, test-first**

Add to `src/service/calm-service.test.tsx`, inside the top-level describe, a block modelled on `fetchDeploymentDecoratorsForArchitecture`'s first test:

```ts
    describe('fetchControlEvaluationDecoratorsForArchitecture', () => {
        it('fetches control-evaluation decorators for the exact version target', async () => {
            const target = `/api/calm/namespaces/${namespace}/architectures/7/versions/1-1-0`;
            const values = [{ uniqueId: 'eval-1', type: 'control-evaluation', target: [target], appliesTo: ['trade-api'], data: { status: 'not-met' } }];
            mock.onGet(`/api/calm/namespaces/${namespace}/decorators/values?target=${encodeURIComponent(target)}&type=control-evaluation`).reply(200, { values });
            expect(await calmService.fetchControlEvaluationDecoratorsForArchitecture(namespace, '7', '1.1.0')).toEqual(values);
        });

        it('returns an empty list when the hub fails', async () => {
            mock.onGet(new RegExp('/decorators/values')).reply(500);
            expect(await calmService.fetchControlEvaluationDecoratorsForArchitecture(namespace, '7', '1.1.0')).toEqual([]);
        });
    });
```

Run: `npm test --workspace calm-hub-ui -- calm-service` → FAIL (method missing).

In `src/service/calm-service.tsx`, rename the body of `fetchDeploymentDecoratorsForArchitecture` into a private `fetchDecoratorsForArchitectureVersion(namespace, id, version, type: string)` that passes `type` to `fetchDecoratorValues`, and define:

```ts
    public async fetchDeploymentDecoratorsForArchitecture(namespace: string, id: string, version: string): Promise<Decorator[]> {
        return this.fetchDecoratorsForArchitectureVersion(namespace, id, version, 'deployment');
    }

    /** Fetches the control-evaluation decorators recorded against one architecture version. */
    public async fetchControlEvaluationDecoratorsForArchitecture(namespace: string, id: string, version: string): Promise<Decorator[]> {
        return this.fetchDecoratorsForArchitectureVersion(namespace, id, version, 'control-evaluation');
    }
```

Keep the existing doc comment on the private method. Run the service tests and the map tests → PASS.

- [ ] **Step 7: Commit**

```bash
git add calm-hub-ui/src/visualizer/contracts calm-hub-ui/src/visualizer/components/reactflow/utils/controlEvaluations.ts calm-hub-ui/src/visualizer/components/reactflow/utils/controlEvaluations.test.ts calm-hub-ui/src/service/calm-service.tsx calm-hub-ui/src/service/calm-service.test.tsx
git commit -m "feat(calm-hub-ui): read control-evaluation decorators and work out each element's latest result"
```

---

### Task 2: The context, the node badge and the red edge

**Files:**
- Create: `calm-hub-ui/src/visualizer/context/ControlEvaluationContext.ts`
- Modify: `calm-hub-ui/src/visualizer/components/reactflow/CustomNode.tsx` and `CustomNode.test.tsx`
- Modify: `calm-hub-ui/src/visualizer/components/reactflow/FloatingEdge.tsx` and `FloatingEdge.test.tsx`

**Interfaces:**
- Consumes: `ElementEvaluation` (Task 1).
- Produces: `ControlEvaluationContext` (a `Map<string, ElementEvaluation>`, default empty) and `useElementEvaluation(id?: string): ElementEvaluation | undefined`.

- [ ] **Step 1: The context**

`src/visualizer/context/ControlEvaluationContext.ts`:

```ts
import { createContext, useContext } from 'react';
import type { ElementEvaluation } from '../contracts/contracts.js';

/**
 * The latest control evaluations for each element of the diagram, keyed by unique-id. Empty unless an architecture
 * from CALM Hub carries control-evaluation decorators.
 */
export const ControlEvaluationContext = createContext<Map<string, ElementEvaluation>>(new Map());

export const useElementEvaluation = (id?: string): ElementEvaluation | undefined => {
    const evaluations = useContext(ControlEvaluationContext);
    return id ? evaluations.get(id) : undefined;
};
```

- [ ] **Step 2: Failing node tests**

Add to `CustomNode.test.tsx` (it already mocks reactflow and renders with `DiagramActionsContext`):

```tsx
import { ControlEvaluationContext } from '../../context/ControlEvaluationContext.js';
import type { ElementEvaluation, ControlEvaluationDecorator } from '../../contracts/contracts.js';

const evaluation = (status: 'met' | 'not-met', extra: Partial<ControlEvaluationDecorator['data']> = {}): ElementEvaluation => ({
    status,
    latest: [{
        schema: 's', uniqueId: 'eval-1', type: 'control-evaluation', target: ['t'], appliesTo: ['node-1'],
        data: { control: { 'unique-id': 'client-ledger-human-approval', 'control-id': 'SDLC-PREV-001', 'requirement-url': 'https://example.org/r' }, status, 'evaluated-at': '2026-11-04T15:00:00Z', ...extra },
    }],
});

function renderWithEvaluation(map: Map<string, ElementEvaluation>) {
    return render(
        <ControlEvaluationContext.Provider value={map}>
            <CustomNode {...makeNodeProps(undefined, { 'unique-id': 'node-1' })} />
        </ControlEvaluationContext.Provider>
    );
}

describe('control evaluations', () => {
    it('shows no badge without an evaluation', () => {
        renderWithEvaluation(new Map());
        expect(screen.queryByTestId('control-evaluation-badge')).toBeNull();
    });

    it('shows Not met, a red border, and the first finding on hover', () => {
        renderWithEvaluation(new Map([['node-1', evaluation('not-met', { findings: [{ subject: 'node-1', description: 'A human approved this change' }] })]]));
        const badge = screen.getByTestId('control-evaluation-badge');
        expect(badge.textContent).toContain('Not met');
        expect(badge.style.color).toBe(toRgb(THEME.colors.error));
        fireEvent.mouseEnter(screen.getByTestId('custom-node'));
        expect(screen.getByText('A human approved this change')).toBeTruthy();
        expect(screen.getByText(/client-ledger-human-approval/)).toBeTruthy();
    });

    it('shows Met and the approver on hover', () => {
        renderWithEvaluation(new Map([['node-1', evaluation('met', { actors: { approver: 'alice' } })]]));
        expect(screen.getByTestId('control-evaluation-badge').textContent).toContain('Met');
        fireEvent.mouseEnter(screen.getByTestId('custom-node'));
        expect(screen.getByText(/approved by alice/)).toBeTruthy();
    });
});
```

`toRgb` converts the theme's hex to the `rgb(r, g, b)` form jsdom reports; if the file already has a colour helper, use it, otherwise add:

```ts
const toRgb = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
```

(If `THEME.colors.error` is not a 6-digit hex, assert on the badge's `data-status="not-met"` attribute instead and add that attribute.)

Run: `npm test --workspace calm-hub-ui -- CustomNode` → the three new tests FAIL.

- [ ] **Step 3: The node badge, border and hover section**

In `CustomNode.tsx`:
- Import `CheckCircle2` and `XCircle` from `lucide-react`, and `useElementEvaluation` from `../../context/ControlEvaluationContext.js`.
- After the existing data extraction, add:

```tsx
  const evaluation = useElementEvaluation(data['unique-id']);
  const evaluationColor = evaluation ? (evaluation.status === 'not-met' ? THEME.colors.error : THEME.colors.success) : undefined;
```

- Base node border: when `evaluation?.status === 'not-met'`, use `3px solid ${THEME.colors.error}`; otherwise keep today's expression.
- Render the badge group when `evaluation` exists too (extend the `riskCount > 0 || mitigationCount > 0 || controlCount > 0` condition with `|| evaluation`), and add as the first badge:

```tsx
            {evaluation && (
              <div
                data-testid="control-evaluation-badge"
                data-status={evaluation.status}
                title={evaluation.latest.map((d) => `${d.data.status === 'not-met' ? '✗' : '✓'} ${d.data.control['unique-id']}`).join('\n')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: `${evaluationColor}20`,
                  color: evaluationColor,
                }}
              >
                {evaluation.status === 'not-met'
                  ? <XCircle style={{ width: '12px', height: '12px' }} />
                  : <CheckCircle2 style={{ width: '12px', height: '12px' }} />}
                <span>{evaluation.status === 'not-met' ? 'Not met' : 'Met'}</span>
              </div>
            )}
```

- In the hover panel, directly before the `Description:` block, add:

```tsx
          {evaluation && (
            <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '8px', marginTop: '8px' }}>
              <div style={{ fontSize: '12px', color: THEME.colors.muted, marginBottom: '4px' }}>Latest control evaluations:</div>
              {evaluation.latest.map((d) => (
                <div key={d.uniqueId} style={{ fontSize: '12px', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 600, color: d.data.status === 'not-met' ? THEME.colors.error : THEME.colors.success }}>
                    {d.data.status === 'not-met' ? '✗' : '✓'} {d.data.control['control-id'] ? `${d.data.control['control-id']} ` : ''}{d.data.control['unique-id']}
                  </div>
                  {d.data.status === 'not-met' && d.data.findings?.[0] && (
                    <div style={{ color: THEME.colors.foreground, marginLeft: '14px' }}>{d.data.findings[0].description}</div>
                  )}
                  {d.data.actors?.approver && (
                    <div style={{ color: THEME.colors.muted, marginLeft: '14px' }}>approved by {d.data.actors.approver}</div>
                  )}
                </div>
              ))}
            </div>
          )}
```

Run the CustomNode tests → PASS (the existing ones too).

- [ ] **Step 4: Failing edge test**

Add to `FloatingEdge.test.tsx`, reusing its existing render helper and mocks (wrap the render in `ControlEvaluationContext.Provider`):

```tsx
it('draws a not-met relationship red, with a Not met label', () => {
    // render the edge with data { 'unique-id': 'rel-1', description: 'writes' } inside a provider whose map
    // has rel-1 → { status: 'not-met', latest: [...] }
    // expect the path element's style.stroke to equal THEME.colors.error (or its rgb form)
    // expect screen.getByTestId('edge-evaluation-badge').textContent to contain 'Not met'
});

it('leaves a met relationship as it was', () => {
    // same with status 'met': the path's stroke is the stroke passed in style; no edge-evaluation-badge
});
```

Write both tests fully using the file's existing helper for props (it passes `style` and `data`); the comments above say exactly what each asserts.

Run: `npm test --workspace calm-hub-ui -- FloatingEdge` → the two new tests FAIL.

- [ ] **Step 5: The edge**

In `FloatingEdge.tsx`:
- Import `useElementEvaluation`.
- After the early `return null` for missing nodes is not allowed for hooks: call the hook **before** that early return, at the top of the component with the other hooks: `const evaluation = useElementEvaluation((data as Record<string, unknown> | undefined)?.['unique-id'] as string | undefined);` and `const notMet = evaluation?.status === 'not-met';`.
- Use `const pathStyle = notMet ? { ...style, stroke: THEME.colors.error, strokeWidth: 3.5 } : style;` on the main `<path>`.
- Extend `hasIndicator` with `|| notMet`, and inside the label container add before the description label:

```tsx
                        {notMet && (
                            <span
                                data-testid="edge-evaluation-badge"
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    padding: '2px 4px',
                                    borderRadius: '4px',
                                    background: THEME.colors.card,
                                    border: `1px solid ${THEME.colors.error}`,
                                    color: THEME.colors.error,
                                }}
                            >
                                ✗ Not met
                            </span>
                        )}
```

Run the FloatingEdge tests → PASS.

- [ ] **Step 6: Commit**

```bash
git add calm-hub-ui/src/visualizer/context/ControlEvaluationContext.ts calm-hub-ui/src/visualizer/components/reactflow/CustomNode.tsx calm-hub-ui/src/visualizer/components/reactflow/CustomNode.test.tsx calm-hub-ui/src/visualizer/components/reactflow/FloatingEdge.tsx calm-hub-ui/src/visualizer/components/reactflow/FloatingEdge.test.tsx
git commit -m "feat(calm-hub-ui): show each node's and relationship's latest control evaluation on the diagram"
```

---

### Task 3: The evaluations panel

**Files:**
- Create: `calm-hub-ui/src/visualizer/components/reactflow/ControlEvaluationsPanel.tsx` and `ControlEvaluationsPanel.test.tsx`
- Modify: `calm-hub-ui/src/visualizer/components/reactflow/MetadataPanel.tsx` and `MetadataPanel.test.tsx`
- Modify: `calm-hub-ui/src/visualizer/contracts/visualizer-contracts.ts` (`MetadataPanelProps.evaluations?: ControlEvaluationDecorator[]`, `MetadataPanelTabType` adds `'evaluations'`)

**Interfaces:**
- Consumes: `newestFirst` (Task 1).
- Produces: `ControlEvaluationsPanel({ evaluations }: { evaluations: ControlEvaluationDecorator[] })`.

- [ ] **Step 1: Failing panel tests**

`ControlEvaluationsPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ControlEvaluationsPanel } from './ControlEvaluationsPanel';
import type { ControlEvaluationDecorator } from '../../contracts/contracts.js';

const make = (id: string, status: 'met' | 'not-met' | 'not-applicable', at: string, extra = {}): ControlEvaluationDecorator => ({
    schema: 's', uniqueId: id, type: 'control-evaluation', target: ['t'], appliesTo: ['trade-api', 'trade-api-to-client-ledger'],
    data: { control: { 'unique-id': 'client-ledger-human-approval', 'control-id': 'SDLC-PREV-001', 'requirement-url': 'https://example.org/r' }, status, 'evaluated-at': at, change: { commit: 'c0ffee1234567', spec: 'SPEC-001' }, ...extra },
});

describe('ControlEvaluationsPanel', () => {
    it('lists evaluations newest first with their status, control, elements and change', () => {
        render(<ControlEvaluationsPanel evaluations={[
            make('older', 'met', '2026-11-04T15:00:00Z', { actors: { approver: 'alice' } }),
            make('newer', 'not-met', '2026-11-04T15:05:00Z', { findings: [{ subject: 'trade-api-to-client-ledger', description: 'A human approved this change' }] }),
        ]} />);
        const rows = screen.getAllByTestId('control-evaluation-row');
        expect(rows[0].textContent).toContain('Not met');
        expect(rows[0].textContent).toContain('A human approved this change');
        expect(rows[0].textContent).toContain('trade-api, trade-api-to-client-ledger');
        expect(rows[0].textContent).toContain('c0ffee1');
        expect(rows[0].textContent).toContain('SPEC-001');
        expect(rows[1].textContent).toContain('Met');
        expect(rows[1].textContent).toContain('approved by alice');
    });

    it('says when there are none', () => {
        render(<ControlEvaluationsPanel evaluations={[]} />);
        expect(screen.getByText(/No control evaluations/)).toBeTruthy();
    });
});
```

Run → FAIL.

- [ ] **Step 2: Write the panel**

`ControlEvaluationsPanel.tsx`, styled like `DeploymentPanel.tsx` (read it first and reuse its spacing and typography choices), with:
- an empty state `No control evaluations for this version.`
- one row per decorator from `newestFirst(evaluations)`, `data-testid="control-evaluation-row"`, showing: a status chip (`Not met` in `THEME.colors.error`, `Met` in `THEME.colors.success`, `Not applicable` in `THEME.colors.muted`); `control-id` and `unique-id`; `appliesTo.join(', ')`; for not-met, every finding's `description` (first in bold) as a short list; `change.commit` first 7 characters and `change.spec`; `approved by <approver>` when `actors.approver`; `evaluated-at` formatted with `toLocaleString()`.

Run → PASS.

- [ ] **Step 3: The metadata panel tab, test-first**

Add a MetadataPanel test: with `evaluations` holding one decorator and no controls/decorators/adrs, the collapsed bar reads `Evaluations (1)`, and expanded, the default tab shows a `control-evaluation-row`. Run → FAIL.

In `MetadataPanel.tsx`: accept `evaluations = []`; `hasEvaluations = evaluations.length > 0`; default tab order: `evaluations` when present, else today's order; add `evaluations` to `tabAvailable`; add the collapsed-bar label `Evaluations (n)` before the others (with the `•` separators the file already uses); add a `TabButton` and render `<ControlEvaluationsPanel evaluations={evaluations} />` for that tab; include `hasEvaluations` in the early `return null` check. Update the contract types. Run all MetadataPanel tests → PASS.

- [ ] **Step 4: Commit**

```bash
git add calm-hub-ui/src/visualizer/components/reactflow/ControlEvaluationsPanel.tsx calm-hub-ui/src/visualizer/components/reactflow/ControlEvaluationsPanel.test.tsx calm-hub-ui/src/visualizer/components/reactflow/MetadataPanel.tsx calm-hub-ui/src/visualizer/components/reactflow/MetadataPanel.test.tsx calm-hub-ui/src/visualizer/contracts/visualizer-contracts.ts
git commit -m "feat(calm-hub-ui): list an architecture version's control evaluations in the metadata panel"
```

---

### Task 4: Fetch, refresh and provide in the drawer

**Files:**
- Modify: `calm-hub-ui/src/visualizer/components/drawer/Drawer.tsx` and its test (`Drawer.test.tsx` if present; otherwise create it)

**Interfaces:**
- Consumes: `fetchControlEvaluationDecoratorsForArchitecture`, `evaluationsByElement`, `ControlEvaluationContext`, `MetadataPanel`'s `evaluations` prop.

- [ ] **Step 1: Failing drawer tests**

Write tests that mock `CalmService` (follow how existing drawer or diagram-section tests mock it) and assert:
- for `data.calmType === 'Architectures'`, `fetchControlEvaluationDecoratorsForArchitecture` is called with `(data.name, data.id, data.version)`, and again after 5 seconds (use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync(5000)`);
- after unmount, advancing timers makes no further calls;
- a dropped file (`fileInstance`) or a pattern makes no call;
- with a decorator whose `appliesTo` names a node of the architecture, the rendered visualizer receives it through `ControlEvaluationContext` (mock `ReactFlowVisualizer` to a component that reads `useElementEvaluation('<node id>')` and prints its status).

Run → FAIL.

- [ ] **Step 2: Implement in `Drawer.tsx`**

```tsx
import { ControlEvaluationContext } from '../../context/ControlEvaluationContext.js';
import { evaluationsByElement } from '../reactflow/utils/controlEvaluations.js';
import type { ControlEvaluationDecorator } from '../../contracts/contracts.js';

const EVALUATION_REFRESH_MS = 5000;
```

Inside the component:

```tsx
    const [evaluations, setEvaluations] = useState<ControlEvaluationDecorator[]>([]);

    // Control evaluations change while the diagram is open (a merge gateway records each decision), so they are
    // re-read every few seconds rather than once.
    useEffect(() => {
        if (!data || data.calmType !== 'Architectures' || fileInstance) {
            setEvaluations([]);
            return;
        }
        let cancelled = false;
        const load = () =>
            calmService
                .fetchControlEvaluationDecoratorsForArchitecture(data.name, data.id, data.version)
                .then((values) => { if (!cancelled) setEvaluations(values as ControlEvaluationDecorator[]); })
                .catch(() => { if (!cancelled) setEvaluations([]); });
        load();
        const timer = setInterval(load, EVALUATION_REFRESH_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [data, fileInstance, calmService]);

    const evaluationMap = useMemo(() => evaluationsByElement(evaluations), [evaluations]);
```

- Include `evaluations.length > 0` in `hasMetadata`.
- Wrap the `<div style={{ flex: 1, … }}>` that holds the visualizers in `<ControlEvaluationContext.Provider value={evaluationMap}>…</ControlEvaluationContext.Provider>`.
- Pass `evaluations={evaluations}` to `MetadataPanel`.

To avoid re-rendering the graph every 5 seconds when nothing changed, only call `setEvaluations` when the fetched list differs from the current one (compare `JSON.stringify` of the two arrays inside a functional `setEvaluations((prev) => …)`); add a test asserting the visualizer does not re-render on an identical refresh only if it is cheap to write, otherwise note it.

Run the drawer tests → PASS.

- [ ] **Step 3: Run the whole UI suite, lint and build**

```bash
npm test --workspace calm-hub-ui 2>&1 | tail -5
npm run lint --workspace calm-hub-ui 2>&1 | tail -5
npm run build --workspace calm-hub-ui 2>&1 | tail -5
```

Expected: all tests pass; lint clean; build succeeds. Fix anything these find in the code this plan added.

- [ ] **Step 4: Commit**

```bash
git add calm-hub-ui/src/visualizer/components/drawer
git commit -m "feat(calm-hub-ui): refresh control evaluations while an architecture is open and hand them to the diagram"
```

---

### Task 5: See it with the gateway, and capture it

**Files:**
- Create (scratch, not committed): `/Users/matthewbain/Development/github/agentic-sdlc-blueprint/.amp/in/hub-screens.mjs`
- Output: `/Users/matthewbain/Development/github/agentic-sdlc-blueprint/.amp/in/artifacts/hub-*.png`

- [ ] **Step 1: Run the stack**

- CALM Hub on :8080 (already running from `../architecture-as-code/calm-hub`: `../mvnw quarkus:dev -Pstandalone,server-only -Dquarkus.console.enabled=false`; start it only if `curl -s localhost:8080/api/calm/namespaces` fails).
- The UI dev server: `npm run start --workspace calm-hub-ui` in the background; note the port Vite prints (default 5173).
- The demo, publishing: in the blueprint, `CALM_HUB_URL=http://localhost:8080 bash gateway/run-demo.sh | tail -2` → `demo ok`; then `git -C /Users/matthewbain/Development/github/agentic-sdlc-blueprint checkout gateway/sessions.json` (the committed recording stays the hub-off one). Read the architecture id from `gateway/.hub-state.json`.

- [ ] **Step 2: Screenshot script**

`.amp/in/hub-screens.mjs` (run with `node`, importing Playwright from `../architecture-as-code/node_modules/playwright/index.mjs` by absolute path):

```js
import { chromium } from '/Users/matthewbain/Development/github/architecture-as-code/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';

const ui = process.env.UI ?? 'http://localhost:5173';
const out = '/Users/matthewbain/Development/github/agentic-sdlc-blueprint/.amp/in/artifacts';
mkdirSync(out, { recursive: true });
const { architectureId } = JSON.parse(readFileSync('/Users/matthewbain/Development/github/agentic-sdlc-blueprint/gateway/.hub-state.json', 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
for (const version of ['1.0.0', '1.1.0']) {
  await page.goto(`${ui}/finos.agentic-sdlc/architectures/${architectureId}/${version}`);
  await page.waitForSelector('[data-testid="custom-node"]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/hub-${version}.png` });
  const node = page.locator('[data-testid="custom-node"]', { hasText: 'Trade API' }).first();
  await node.hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/hub-${version}-trade-api-hover.png` });
}
await browser.close();
console.log('screenshots written');
```

Run: `node .amp/in/hub-screens.mjs` (from the blueprint root).
Expected: four PNGs. In `hub-1.1.0.png`, Trade API shows a red "Not met" badge and border, and the `trade-api-to-client-ledger` relationship is red with "✗ Not met"; the hover shot shows "A human approved this change". In `hub-1.0.0.png`, Trade API reflects its latest 1.0.0 decision (the shortcut's DENY) and Position Service shows "Met".

If the route shape differs, find the right one from the Hub UI's tree navigation and adjust the URL; if the metadata panel is collapsed, also click its expand button and capture `hub-1.1.0-panel.png`.

- [ ] **Step 3: Report**

List the screenshot paths in the report for the controller to inspect. Stop the UI dev server you started; leave CALM Hub running. Do not commit anything in either repository in this task.
