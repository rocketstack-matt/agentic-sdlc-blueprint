# Decorator Standard (copy)

`control-evaluation.decorator.standard.json` is the control evaluation decorator Standard proposed to FINOS CALM's
draft standards (`calm/draft/2026-03/standards/compliance/`), with `decorators.json`, the draft base decorator it
extends. Every decorator the gateway writes is validated against them. The validation removes the instance's
`$schema` key first: CALM's base decorator schema sets `additionalProperties: false` without listing `$schema`, so
every decorator instance that names its schema, upstream's own examples included, would fail otherwise.
