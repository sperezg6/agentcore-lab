import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";
import { AgentMemory } from "./agent-memory-construct";
import { AgentTools } from "./agent-tools-construct";

const DEFAULT_MODEL = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

export interface AgentRuntimeProps {
  /** Path to the Python Agent Folder  */
  readonly agentAssetsPath: string;
  readonly runtimeName?: string;

  readonly modelId?: string;

  /** Optional Capabilities */
  readonly memory?: AgentMemory;
  readonly tools?: AgentTools;

  /** Extra env variables */
  readonly environment?: Record<string, string>;
  readonly tracingEnabled?: boolean;
}

/** Reusable AgentCore Runtime.*/
export class AgentRuntime extends Construct {
  public readonly runtime: agentcore.Runtime;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: AgentRuntimeProps) {
    super(scope, id);

    this.logGroup = new logs.LogGroup(this, "Logs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const env: Record<string, string> = {
      MODEL_ID: props.modelId ?? DEFAULT_MODEL,
    };
    if (props.memory) env.BEDROCK_AGENTCORE_MEMORY_ID = props.memory.memoryId;
    if (props.tools?.codeInterpreterEnabled)
      env.ENABLE_CODE_INTERPRETER = "true";
    Object.assign(env, props.environment ?? {});

    this.runtime = new agentcore.Runtime(this, "Resource", {
      runtimeName: props.runtimeName,
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromCodeAsset({
        path: props.agentAssetsPath,
        runtime: agentcore.AgentCoreRuntime.PYTHON_3_13,
        entrypoint: ["agent.py"],
        // Install Python deps into the asset. AgentCore runs ARM64 Linux, so we
        // build the wheels inside the matching Python image (needs Docker running).
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            "bash",
            "-c",
            "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
          ],
        },
      }),
      networkConfiguration:
        agentcore.RuntimeNetworkConfiguration.usingPublicNetwork(),
      environmentVariables: env,
      tracingEnabled: props.tracingEnabled ?? true,
      loggingConfigs: [
        {
          logType: agentcore.LogType.APPLICATION_LOGS,
          destination: agentcore.LoggingDestination.cloudWatchLogs(
            this.logGroup,
          ),
        },
      ],
    });

    /** Grants live with the capabilities. */
    const role = this.runtime.role;
    props.memory?.grantUse(role);
    props.tools?.grantUse(role);

    // Allow the agent to invoke the Bedrock model. The "us." model id is a
    // cross-region inference profile, so we grant both the profile and the
    // underlying foundation models (region wildcarded for the profile's targets).
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          `arn:aws:bedrock:*:${cdk.Stack.of(this).account}:inference-profile/*`,
          "arn:aws:bedrock:*::foundation-model/*",
        ],
      }),
    );
  }

  public get runtimeArn(): string {
    return this.runtime.agentRuntimeArn;
  }
}
