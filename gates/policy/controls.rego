package controls

import data.ergo

entries := array.concat(
	[{"key": key, "on": "system", "config": r.config} |
		some key, c in object.get(input.architecture, "controls", {})
		some r in c.requirements
	],
	[{"key": key, "on": n["unique-id"], "config": r.config} |
		some n in input.architecture.nodes
		some key, c in object.get(n, "controls", {})
		some r in c.requirements
	],
)

with_ergo := [e | some e in entries; e.config.ergo]

policy := {
	"subjects": {name: s | some e in with_ergo; some name, s in e.config.ergo.subjects},
	"requirements": {name: q | some e in with_ergo; some name, q in e.config.ergo.requirements},
}

covered contains m if {
	some q in policy.requirements
	m := q.meta["calm-control"]
}

problems := array.concat(
	[concat("", ["control ", e.key, " has neither config.ergo nor evaluated-by: pipeline"]) |
		some e in entries
		not e.config.ergo
		not e.config["evaluated-by"] == "pipeline"
	],
	[concat("", ["control ", e.key, " has no requirement whose meta.calm-control names it"]) |
		some e in with_ergo
		not covered[e.key]
	],
)

report := ergo.report(input, policy, {})

result := {
	"report": report,
	"violations": ergo.violations(report),
	"problems": problems,
	"controls": {e.key: e.on | some e in entries},
}
