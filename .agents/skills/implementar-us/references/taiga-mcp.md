# MCP de Taiga: instal·lació a nivell d'usuari

Paquet: `@elio9352/taiga-mcp-server` (fork mantingut per la comunitat; existeix a npm, `1.12.0` verificada el 2026-10-13). **Es fixa la versió** (regla 7 d'AGENTS.md): en actualitzar-la, comprova-ho a npm abans.

**Regles de seguretat (innegociables):**
- La configuració va **fora del repo**, al fitxer d'usuari de cada eina. Mai `.mcp.json`, `.env` ni cap fitxer versionat amb credencials.
- **Les credencials les escriu la persona al seu terminal.** L'agent no les demana pel xat, no les llegeix, no les escriu i no executa l'ordre per ella amb el prefix `!` (quedaria a la sessió). L'eina `authenticate` de l'MCP no s'utilitza amb credencials donades pel xat.
- Variables de l'MCP: `TAIGA_API_URL` (`https://api.taiga.io/api/v1`), `TAIGA_USERNAME`, `TAIGA_PASSWORD`.
- Limitació coneguda: la majoria d'eines desen el valor en clar al fitxer d'usuari (a `~`, fora del repo). Que sigui fora del repo no el fa secret: no copiïs aquest fitxer enlloc.

## Claude Code (ordre exacta)

«A nivell d'usuari i lligat a aquest repo» és l'abast **`local`**: es desa a `~/.claude.json`, dins l'entrada d'aquest projecte, i només el veus tu en aquest repo (`--scope user` el faria visible a tots els teus projectes; `--scope project` el posaria a `.mcp.json` dins del repo: **no**).

PowerShell 7 (la contrasenya es demana sense eco i no queda a l'historial):

```powershell
$p = Read-Host "Contrasenya de Taiga" -MaskInput
claude mcp add -e TAIGA_API_URL=https://api.taiga.io/api/v1 -e TAIGA_USERNAME=<usuari> -e "TAIGA_PASSWORD=$p" --transport stdio --scope local taiga-mcp -- npx -y @elio9352/taiga-mcp-server@1.12.0
Remove-Variable p
```

Bash/zsh:

```bash
read -rs P && claude mcp add -e TAIGA_API_URL=https://api.taiga.io/api/v1 -e TAIGA_USERNAME=<usuari> -e "TAIGA_PASSWORD=$P" --transport stdio --scope local taiga-mcp -- npx -y @elio9352/taiga-mcp-server@1.12.0; unset P
```

Notes (de la doc oficial, https://code.claude.com/docs/en/mcp): `--` separa les opcions de Claude de l'ordre del servidor; no posis el nom del servidor just després d'un `-e` (es llegiria com un altre parell), per això `--transport` va entre mig. Reinicia la sessió o comprova amb `claude mcp list`.

Si ja existeix una entrada `taiga-mcp` (p. ex. amb un altre abast), una segona amb el mateix nom pot entrar en conflicte: `claude mcp list` i, si cal, `claude mcp remove taiga-mcp --scope <abast>` abans de tornar-la a afegir.

## Altres eines (configuració a nivell d'usuari)

Verificat a la documentació oficial el 2026-10-13. Els punts marcats **NO VERIFICAT** no estan a la doc: comprova'ls abans de fiar-te'n. Els placeholders són `<usuari>` i `<contrasenya>`; les contrasenyes no s'escriuen al fitxer quan l'eina permet referenciar una variable d'entorn.

### OpenAI Codex CLI
Doc: https://developers.openai.com/codex/mcp · Fitxer d'usuari: `~/.codex/config.toml`.
`env_vars` reenvia variables de l'entorn sense desar-ne el valor: exporta `TAIGA_PASSWORD` abans d'arrencar `codex`.

```toml
[mcp_servers.taiga]
command = "npx"
args = ["-y", "@elio9352/taiga-mcp-server@1.12.0"]
env_vars = ["TAIGA_PASSWORD"]

[mcp_servers.taiga.env]
TAIGA_API_URL = "https://api.taiga.io/api/v1"
TAIGA_USERNAME = "<usuari>"
```
CLI: `codex mcp add taiga --env TAIGA_API_URL=https://api.taiga.io/api/v1 --env TAIGA_USERNAME=<usuari> -- npx -y @elio9352/taiga-mcp-server@1.12.0` i afegeix `env_vars = ["TAIGA_PASSWORD"]` al fitxer (`--env` desa el valor en clar). **NO VERIFICAT:** que `codex mcp add` tingui un flag per a `env_vars`.

### Gemini CLI
Doc: https://geminicli.com/docs/tools/mcp-server/ · Fitxer d'usuari: `~/.gemini/settings.json` (per defecte `gemini mcp add` escriu a l'abast `project`: usa `-s user`).
`$VAR` / `${VAR}` s'expandeix a `env` (una variable no definida es resol a cadena buida).

```json
{
  "mcpServers": {
    "taiga": {
      "command": "npx",
      "args": ["-y", "@elio9352/taiga-mcp-server@1.12.0"],
      "env": {
        "TAIGA_API_URL": "$TAIGA_API_URL",
        "TAIGA_USERNAME": "$TAIGA_USERNAME",
        "TAIGA_PASSWORD": "$TAIGA_PASSWORD"
      }
    }
  }
}
```
CLI: `gemini mcp add -s user -e TAIGA_API_URL=https://api.taiga.io/api/v1 -e TAIGA_USERNAME=<usuari> taiga npx -y @elio9352/taiga-mcp-server@1.12.0` i afegeix la contrasenya amb `$TAIGA_PASSWORD` editant el JSON. **NO VERIFICAT:** si `gemini mcp add` interpreta `-y` com a flag propi i cal un `--` separador.

### OpenCode
Docs: https://opencode.ai/docs/mcp-servers/ i https://opencode.ai/docs/config/ · Fitxer d'usuari: `~/.config/opencode/opencode.json`. Substitució d'entorn: `{env:VAR}`.

```jsonc
{
  "mcp": {
    "taiga": {
      "type": "local",
      "command": ["npx", "-y", "@elio9352/taiga-mcp-server@1.12.0"],
      "enabled": true,
      "environment": {
        "TAIGA_API_URL": "{env:TAIGA_API_URL}",
        "TAIGA_USERNAME": "{env:TAIGA_USERNAME}",
        "TAIGA_PASSWORD": "{env:TAIGA_PASSWORD}"
      }
    }
  }
}
```
**NO VERIFICAT:** que `{env:...}` funcioni dins d'`environment` (la doc ho cobreix amb la regla general de la config, no amb un exemple explícit) i l'existència d'una ordre `opencode mcp add` equivalent.

### GitHub Copilot
- **VS Code** (https://code.visualstudio.com/docs/copilot/customization/mcp-servers): executa la comanda **MCP: Open User Configuration** (obre el `mcp.json` d'usuari; la ruta exacta a Windows no surt a la doc: **NO VERIFICAT**). Demana la contrasenya amb `promptString` i `password: true`, i la desa de manera segura.

```json
{
  "inputs": [
    { "type": "promptString", "id": "taiga-url", "description": "Taiga API URL" },
    { "type": "promptString", "id": "taiga-user", "description": "Usuari de Taiga" },
    { "type": "promptString", "id": "taiga-password", "description": "Contrasenya de Taiga", "password": true }
  ],
  "servers": {
    "taiga": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@elio9352/taiga-mcp-server@1.12.0"],
      "env": {
        "TAIGA_API_URL": "${input:taiga-url}",
        "TAIGA_USERNAME": "${input:taiga-user}",
        "TAIGA_PASSWORD": "${input:taiga-password}"
      }
    }
  }
}
```
- **Copilot CLI** (https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers): fitxer d'usuari `~/.copilot/mcp-config.json` (o `$COPILOT_HOME/mcp-config.json`), clau `mcpServers` amb `type: "local"`, `command`, `args`, `env` i `tools: ["*"]`. **La doc no descriu cap substitució de variables**: la contrasenya quedaria en clar a `~`. **NO VERIFICAT** si admet `${VAR}`. Si no vols deixar-la en clar, usa un altre client per a Taiga o copia i enganxa el text de la US.

## Comprovar que funciona

Després d'instal·lar, demana a l'agent que llegeixi una US coneguda (p. ex. `TG-48`). Si falla l'autenticació, revisa les credencials **al terminal** (torna a executar l'ordre); no les passis per aquí.

## Si no hi ha MCP

Alternatives (la persona tria): `claude-in-chrome` per llegir la US a la web de Taiga, o enganxar el text de la US al xat.
