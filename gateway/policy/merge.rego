# Merge gateway policy (Rego v1, compiled to WebAssembly).
#
# DATA  is the FINOS CALM architecture (data.arch) with the catalogue's controls attached as config.
# INPUT is the change, the review record and the human approval token, plus input.now (unix seconds).
# The gateway verifies hashes and signatures in Node before evaluation and marks each record
# `verified`; this policy reasons over claims only. Deny by default: allow needs an empty deny set.

package merge

default allow := false

allow if count(deny) == 0

# The code review control as configured in the model.
policy := data.arch.controls["sdlc-prev-001-code-review"].requirements[0].config

human := policy["human-approval"]

nodes_by_id[id] := node if {
	some node in data.arch.nodes
	id := node["unique-id"]
}

# A file belongs to the node whose source-path is its prefix.
touched contains id if {
	some id, node in nodes_by_id
	some file in input.change.files
	startswith(file, concat("", [node.metadata["source-path"], "/"]))
}

# --- what the control says about human review --------------------------------------------------

# Nodes at or above a human rule's tier ceiling, or holding a classification it names.
human_nodes contains id if {
	some rule in policy.rules
	rule.mode == "human"
	some id in touched
	nodes_by_id[id].metadata["criticality-tier"] <= rule["max-criticality-tier"]
}

human_nodes contains id if {
	some rule in policy.rules
	rule.mode == "human"
	some id in touched
	nodes_by_id[id].metadata["data-classification"] in rule["data-classifications"]
}

# Files under a control plane path.
human_paths contains file if {
	some rule in policy.rules
	rule.mode == "human"
	some path in rule.paths
	some file in input.change.files
	startswith(file, path)
}

needs_human if count(human_nodes) > 0

needs_human if count(human_paths) > 0

why_human := concat(", ", array.concat(
	[sprintf("%s is tier %d, %s", [id, nodes_by_id[id].metadata["criticality-tier"], nodes_by_id[id].metadata["data-classification"]]) | some id in human_nodes],
	[sprintf("%s is a control plane path", [file]) | some file in human_paths],
))

# --- the spec ------------------------------------------------------------------------------------

deny contains msg if {
	not input.spec.approved
	msg := sprintf("%s is not an approved spec", [input.change.spec])
}

deny contains msg if {
	some id in touched
	not id in input.spec.nodes
	msg := sprintf("node %s is outside the scope of %s", [id, input.change.spec])
}

# --- the review ----------------------------------------------------------------------------------

deny contains "no review record" if not input.review

deny contains "review signature is invalid" if {
	input.review
	not input.review.verified
}

deny contains "author may not review its own change" if {
	policy["author-may-not-review"]
	input.review.reviewer == input.change.author
}

deny contains msg if {
	input.review
	not input.review.reviewer in policy["approved-cognitive-engines"]
	msg := sprintf("reviewer %s is not an approved cognitive engine", [input.review.reviewer])
}

deny contains "review is for a different commit" if input.review.commit != input.change.commit

deny contains "review is for a different diff" if input.review.diff_sha256 != input.change.diff_sha256

deny contains "review did not approve the change" if input.review.verdict != "approve"

# --- the human approval token ----------------------------------------------------------------

deny contains msg if {
	needs_human
	not input.approval
	msg := sprintf("human approval required (%s) but no token presented", [why_human])
}

deny contains "approval token signature is invalid" if {
	input.approval
	not input.approval.verified
}

deny contains msg if {
	input.approval.iss != human.issuer
	msg := sprintf("approval token issued by %s, not %s", [input.approval.iss, human.issuer])
}

deny contains msg if {
	input.approval.aud != human.audience
	msg := sprintf("approval token is for audience %s, not %s", [input.approval.aud, human.audience])
}

deny contains "approval token has expired" if input.now > input.approval.exp

deny contains msg if {
	input.now - input.approval.iat > human["max-age-seconds"]
	msg := sprintf("approval token is older than %d seconds", [human["max-age-seconds"]])
}

deny contains msg if {
	human["single-use"]
	input.approval.used
	msg := sprintf("approval token %s has already been used", [substring(input.approval.jti, 0, 8)])
}

# The grant inside the token (RFC 9396 authorization_details) must match the change on every
# field the control binds it to.
grants contains g if {
	some g in input.approval.authorization_details
	g.type == "repo:merge"
}

deny contains "approval token grants no repo:merge" if {
	input.approval.verified
	count(grants) == 0
}

deny contains msg if {
	"commit-sha" in human["bound-to"]
	some g in grants
	g.commit != input.change.commit
	msg := sprintf("approval token is bound to commit %s, not %s", [substring(g.commit, 0, 7), substring(input.change.commit, 0, 7)])
}

deny contains msg if {
	"diff-sha256" in human["bound-to"]
	some g in grants
	g.diff_sha256 != input.change.diff_sha256
	msg := sprintf("approval token is bound to a different diff (sha256 %s, this change is %s)", [substring(g.diff_sha256, 0, 12), substring(input.change.diff_sha256, 0, 12)])
}

deny contains msg if {
	"spec-id" in human["bound-to"]
	some g in grants
	g.spec != input.change.spec
	msg := sprintf("approval token is bound to %s, not %s", [g.spec, input.change.spec])
}
