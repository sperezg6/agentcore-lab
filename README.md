# agentcore-lab

A personal AI agent on **Amazon Bedrock AgentCore**, built as a learning lab.
Infrastructure is defined with **AWS CDK (TypeScript)**; the agent itself is
**Python** (Strands). The two halves meet through environment variables that CDK
injects into the runtime — CDK owns *what exists*, Python owns *what it does*.

---

## Architecture

```
┌─────────────────────────── AgentcoreLabStack (CDK) ───────────────────────────┐
│                                                                                │
│   AgentMemory ──┐                                                              │
│   (STM + LTM)   │                                                              │
│                 │  injected as env vars + IAM grants                           │
│   AgentTools ───┼──────────────►  AgentRuntime  ──────►  agent/agent.py        │
│   (Code Interp, │                 (Bedrock AgentCore     (Strands agent loop,  │
│    Browser)     │                  Runtime, ARM64)        @app.entrypoint)      │
│                 │                                                              │
│   Bedrock IAM ──┘                                                              │
│   (InvokeModel)                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

Each AgentCore capability is a **reusable construct** that owns both its resource
*and* its `grantUse()` logic, so a capability can never be wired into the runtime
without the matching IAM grant.

| Construct | File | Provisions |
|---|---|---|
| `AgentMemory` | `infra/constructs/agent-core/agent-memory-construct.ts` | AgentCore Memory (STM + 3 LTM strategies: summarization, semantic, user-preference) |
| `AgentTools` | `infra/constructs/agent-core/agent-tools-construct.ts` | Code Interpreter (sandbox) + optional managed Browser |
| `AgentRuntime` | `infra/constructs/agent-core/agent-runtime-construct.ts` | AgentCore Runtime, env-var wiring, Bedrock invoke grant, CloudWatch logs |

---

## Repo layout

```
agentcore-lab/
├── agent/                     # Python agent — the deployable Runtime artifact
│   ├── agent.py               #   @app.entrypoint — the agent loop
│   ├── constants.py           #   model id, namespaces, system prompt
│   ├── tools.py
│   └── requirements.txt       #   bundled into the asset at deploy time
├── infra/                     # CDK app (TypeScript)
│   ├── bin/app.ts             #   CDK entry point
│   ├── lib/agentcore-lab-stack.ts
│   ├── constructs/            #   reusable AgentCore constructs
│   └── cdk.json
└── README.md
```

---

## The CDK ↔ Python seam

`AgentRuntime` injects these env vars; the agent reads them at runtime. They must
match on both sides exactly.

| Env var | Set by | Read in |
|---|---|---|
| `MODEL_ID` | `AgentRuntime` (`DEFAULT_MODEL`) | `agent/constants.py` |
| `BEDROCK_AGENTCORE_MEMORY_ID` | `AgentRuntime` (when `memory` passed) | `agent/constants.py` |
| `ENABLE_CODE_INTERPRETER` | `AgentRuntime` (when `tools` passed) | `agent/constants.py` |
| `MEMORY_NAMESPACES` | default in `constants.py` | `agent/agent.py` |

> ⚠️ `constants.py` currently **hardcodes** `MODEL_ID` instead of reading
> `os.getenv("MODEL_ID")`, so the CDK-injected `MODEL_ID` is ignored. Change the
> model in `constants.py` (or make it read the env var) — not just in the construct.

---

## Prerequisites

- Node.js 20+, AWS CDK CLI **≥ 2.1128** (run via `npx cdk`, not a stale global `cdk`)
- `aws-cdk-lib` **≥ 2.260** (AgentCore L2 constructs)
- AWS CLI **v2** (the AgentCore data plane is the `bedrock-agentcore` service)
- **Docker running** — dependency bundling builds ARM64 wheels in a container
- Bedrock **model access** enabled for your model in the target region
- AWS credentials configured (`aws configure`)

---

## Deploy

```bash
cd infra
npm ci

# one-time per account/region
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1

# make sure Docker Desktop is running, then:
npx cdk deploy
```

On success the stack outputs `RuntimeArn`. Copy it.

---

## Invoke the agent

There is **no public URL** — AgentCore Runtime is invoked through an AWS API, so
requests are SigV4-signed with your AWS credentials.

```bash
aws bedrock-agentcore invoke-agent-runtime \
  --region us-east-1 \
  --agent-runtime-arn "<RuntimeArn>" \
  --runtime-session-id "my-session-0000000000000000000000000000" \
  --qualifier DEFAULT \
  --content-type "application/json" \
  --accept "application/json" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"prompt":"hi, who are you?"}' \
  response.json

cat response.json
```

Notes:
- `--runtime-session-id` must be **≥ 33 characters**. Reuse it across calls to keep
  conversational (short-term) memory; change it for a fresh session.
- `--cli-binary-format raw-in-base64-out` is required so `--payload` accepts raw JSON.

---

## Logs & debugging

```bash
aws logs tail "/aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT" \
  --region us-east-1 --since 15m --format short
```

---

## Useful commands

| Command | Description |
|---|---|
| `npx cdk synth` | Synthesize the CloudFormation template (fast compile check) |
| `npx cdk diff` | Diff deployed stack vs. local |
| `npx cdk deploy` | Build asset (Docker) + deploy |
| `npx cdk destroy` | Tear the stack down |

---

## Gotchas learned the hard way

- **CLI ≥ library.** A stale global `cdk` can't read a newer manifest
  (`schema version mismatch`). Always use `npx cdk`.
- **`fromCodeAsset` zips, it does not `pip install`.** Dependencies must be
  **bundled** (see the `bundling` block in `agent-runtime-construct.ts`), which
  needs Docker. Without it: `ModuleNotFoundError` at startup.
- **Bundle on ARM64.** AgentCore runs ARM64 Linux; build wheels in the matching
  Python image, not on macOS.
- **Entrypoint is a file, not a command.** `["agent.py"]`, not `["python", "agent.py"]`
  (no spaces, no leading `/`, single dot).
- **Failed creates land in `ROLLBACK_COMPLETE`** — you must `cdk destroy` before
  redeploying; a failed *update* on a live stack can just be redeployed.
- **Invoking the model is a plain Bedrock grant**, separate from AgentCore’s
  `grantUse()`. The runtime role needs `bedrock:InvokeModel*` on both the
  `inference-profile/*` and `foundation-model/*` ARNs.
- **Bedrock token quotas.** "Too many tokens per day" is an **account quota**, not
  an agent bug. Per-**minute** quotas are self-adjustable via Service Quotas;
  per-**day** quotas are not — a 0/day across all models means the account isn’t
  activated for on-demand inference (open an AWS account-activation support case).

---

## Status

- ✅ Infra deploys; Memory, Code Interpreter, Browser, IAM all provisioned
- ✅ Agent starts, reads/writes Memory, initializes tools, calls Bedrock
