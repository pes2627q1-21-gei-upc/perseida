# Perseida · Obsidian Vault

**English** | [Català](README.ca.md) | [Español](README.es.md)

> 🚧 **Under construction.** The vault is created as part of the backlog story "Obsidian Vault with architecture and decision context for AI agents". Contents below describe the **planned** state.

Project documentation of **Perseida** (PES project, UPC-FIB), maintained as an [Obsidian](https://obsidian.md) vault inside the monorepo. It is the **shared context** for the six team members and their AI coding assistants (Claude Code, Claude, Gemini), so generated code is coherent across the team.

## Purpose

- Keep one source of truth about **what the system is and why it was built that way**.
- Let any assistant start from the same information as any teammate.
- Record decisions as they are made, so debates already settled are not repeated.

An agent-instructions file at the root of the monorepo tells assistants to read this context before making any change.

## What the vault contains (planned)

| Area | Content |
|---|---|
| Architecture | Physical architecture (single Virtech server, Docker Compose, five services), hexagonal backend, offline-capable mobile client, domain/UML models. |
| Decisions | Technical decisions with justification and discarded alternatives (e.g. Docker Compose instead of Kubernetes, in-process scheduler, local Kev-4B moderation, Redis as cache only). |
| Conventions | GitFlow, PR template and review checklist, Definition of Ready/Done, quality rules (`ruff`, `mypy`, ESLint, Prettier, SonarQube Quality Gate), testing strategy and test data structure. |
| Project state | Current status and what was done in each work session. |
| Product | Inception summary: NOT list, stakeholders, epics and user stories, service contracts with Spotwise. |

## Working with the vault

- Open the `obsidian_vault/` folder as a vault in Obsidian.
- Update it **at the end of each work session** and **whenever a new decision is made**. Updating the vault when a change affects documentation is part of the PR review checklist.
- Prefer small linked notes (`[[wikilinks]]`) over long documents.
- Never put secrets, credentials (`.env`, tokens) or users' personal data in the vault: assistants read it.

## Rules for AI assistants (summary)

- The author of a PR is responsible for all the code in it, whether written by them or by an assistant, and must be able to explain it.
- Assistants work on `feature/*` branches; they cannot merge or bypass protected branches.
- AI-generated code goes through the same CI, Quality Gate and peer review.
- Check that libraries and APIs proposed actually exist; add dependencies with `uv`/`pnpm` and pinned versions.

## Related

[Backend](../backend/README.md) · [Frontend](../frontend/README.md) · [Infrastructure](../infra/README.md)

## Team

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
