# Perseida · Obsidian Vault

**English** | [Català](README.ca.md) | [Español](README.es.md)

Project documentation of **Perseida** (PES project, UPC-FIB), maintained as an [Obsidian](https://obsidian.md) vault inside the monorepo. It is the **shared context** for the six team members and their AI coding assistants (Claude Code, Claude, Gemini), so generated code is coherent across the team.

## Purpose

- Keep one source of truth about **what the system is and why it was built that way**.
- Let any assistant start from the same information as any teammate.
- Record decisions as they are made, so debates already settled are not repeated.

An agent-instructions file at the root of the monorepo tells assistants to read this context before making any change.

## What the vault contains

The entry note is [`00-index.md`](00-index.md): reading order, sources of truth and a map of every folder.

| Area (folder) | Content |
|---|---|
| Architecture (`arquitectura/`) | Physical architecture (single Virtech server, Docker Compose, five services), hexagonal backend, frontend, domain model, external services, Spotwise contract and one note per component. |
| Decisions (`decisions/`) | 15 ADRs with justification and discarded alternatives (e.g. Docker Compose instead of Kubernetes, local Kev-4B moderation, Redis as lazy cache only). |
| Conventions (`convencions/`) | GitFlow, Definition of Done, quality rules, testing, AI assistants, vault updating and Obsidian note conventions. |
| Product (`producte/`) | NOT list, stakeholders, epics and user stories. |
| State (`estat/`) | Current status (`estat-actual`) and the notes of each work session. |
| Guides (`guies/`) | How agents read and write the vault; getting started. |
| Templates (`plantilles/`) | ADR, component, convention and session templates. |

## Working with the vault

- Open the `obsidian_vault/` folder as a vault in Obsidian.
- Update it **at the end of each work session** and **whenever a new decision is made**. Updating the vault when a change affects documentation is part of the PR review checklist.
- Prefer small linked notes (`[[wikilinks]]`) over long documents.
- Never put secrets, credentials (`.env`, tokens) or users' personal data in the vault: assistants read it.
- Notes are written in Catalan.
- Every note is created or edited with the Obsidian skills (`.agents/skills`, see [`AGENTS.md`](../AGENTS.md)).
- Claude Code's `SessionStart` hook injects the index and the current state; other agents read `AGENTS.md`. See [how to read the vault as an agent](guies/llegir-el-vault-com-a-agent.md).

## Rules for AI assistants (summary)

- The author of a PR is responsible for all the code in it, whether written by them or by an assistant, and must be able to explain it.
- Assistants work on `feature/*` branches; they cannot merge or bypass protected branches.
- AI-generated code goes through the same CI, Quality Gate and peer review.
- Check that libraries and APIs proposed actually exist; add dependencies with `uv`/`pnpm` and pinned versions.
- The Obsidian skills are mandatory for any file in the vault.
- If a story changes the architecture or takes a relevant decision, update the vault before merging the PR.

## Related

[Backend](../backend/README.md) · [Frontend](../frontend/README.md) · [Infrastructure](../infra/README.md)

## Team

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
