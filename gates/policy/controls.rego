package controls

import data.ergo

entries := array.concat(
	array.concat(
		[{"key": key, "on": "system", "config": object.get(r, "config", {})} |
			some key, c in object.get(input.architecture, "controls", {})
			some r in c.requirements
		],
		[{"key": key, "on": n["unique-id"], "config": object.get(r, "config", {})} |
			some n in input.architecture.nodes
			some key, c in object.get(n, "controls", {})
			some r in c.requirements
		],
	),
	array.concat(
		[{"key": key, "on": rel["unique-id"], "config": object.get(r, "config", {})} |
			some rel in object.get(input.architecture, "relationships", [])
			some key, c in object.get(rel, "controls", {})
			some r in c.requirements
		],
		[{"key": key, "on": f["unique-id"], "config": object.get(r, "config", {})} |
			some f in object.get(input.architecture, "flows", [])
			some key, c in object.get(f, "controls", {})
			some r in c.requirements
		],
	),
)

with_ergo := [e | some e in entries; e.config.ergo]

# Every control's policy declares the version of ergo's spec it is written for. They are merged into one policy, so
# they must agree: the version is passed on when they all give the same one, and ergo reports a policy without one
# as written wrong.
specs := {object.get(e.config.ergo, "ergo_spec", null) | some e in with_ergo}

default ergo_spec := null

ergo_spec := s if {
	count(specs) == 1
	some s in specs
}

policy := {
	"ergo_spec": ergo_spec,
	"subjects": {name: s | some e in with_ergo; some name, s in e.config.ergo.subjects},
	"requirements": {name: q | some e in with_ergo; some name, q in e.config.ergo.requirements},
}

covered contains m if {
	some q in policy.requirements
	m := q.meta["calm-control"]
}

problems := array.concat(
	array.concat(
		[concat("", ["control ", e.key, " has neither config.ergo nor evaluated-by: pipeline"]) |
			some e in entries
			not e.config.ergo
			not e.config["evaluated-by"] == "pipeline"
		],
		[concat("", ["control ", e.key, " has no requirement whose meta.calm-control names it"]) |
			some e in with_ergo
			not covered[e.key]
		],
	),
	[concat("", ["the controls disagree on ergo_spec: ", concat(", ", sort([sprintf("%v", [s]) | some s in specs]))]) |
		count(specs) > 1
	],
)

report := ergo.report(input, policy, {})

result := {
	"report": report,
	"violations": ergo.violations(report),
	"problems": problems,
	"controls": {e.key: e.on | some e in entries},
}
