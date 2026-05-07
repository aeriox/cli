# @aeriox-co/cli

Official CLI for [AERIOX](https://aeriox.co) — generate images, video, voice, and compose multi-shot films from your terminal.

> **Status:** v0.0.0 is a name-reservation stub. The real CLI ships at v1.0.0.

## Install

```bash
npm install -g @aeriox-co/cli
```

Requires Node.js 20 or newer.

## Quickstart

```bash
aeriox login
aeriox generate "a sunset over the Pacific" --model flux_2_dev
aeriox jobs watch <job_id>
```

`aeriox login` opens your browser to authenticate via OAuth 2.0 with PKCE. Tokens are stored in your OS keychain.

## Commands

| Command | Description |
|---|---|
| `aeriox login` | Authenticate via browser-based OAuth (PKCE loopback). |
| `aeriox logout` | Revoke refresh token and clear stored session. |
| `aeriox whoami` | Show current workspace, scopes, and wallet balance. |
| `aeriox generate "<prompt>"` | Generate an image. |
| `aeriox video "<prompt>"` | Generate a video clip. |
| `aeriox audio "<text>"` | Generate audio from text. |
| `aeriox compose <segments.json>` | Stitch a multi-shot composition. |
| `aeriox characters list\|create\|get\|delete` | Manage character library. |
| `aeriox prisms list\|apply` | List and apply prism transforms. |
| `aeriox jobs list\|watch\|cancel` | Inspect job state. |
| `aeriox models list` | List available models. |
| `aeriox wallet balance\|topup\|history` | Manage credits. |
| `aeriox keys list\|create\|rotate\|delete` | Manage API keys. |
| `aeriox batch <prompts.txt>` | Fire many generations in parallel. |

Run `aeriox <command> --help` for full flag detail.

## Environment variables

| Variable | Purpose |
|---|---|
| `AERIOX_API_KEY` | Use a long-lived API key instead of OAuth tokens. |
| `AERIOX_BASE_URL` | Override API host (default `https://api.aeriox.co`). |
| `AERIOX_OUTPUT_DIR` | Default download directory for generated assets. |
| `AERIOX_NO_COLOR` | Disable ANSI color output. |
| `AERIOX_NO_KEYCHAIN` | Force the `~/.config/aeriox/session.json` file fallback (chmod 0600). |

## Documentation

Full API reference and guides: <https://developer.aeriox.co>.

## License

MIT — see [LICENSE](./LICENSE).
