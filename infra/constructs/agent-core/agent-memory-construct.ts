import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";

export interface AgentMemoryProps {
  readonly memoryName?: string;
  readonly description?: string;
  /** LTM Extraction Strategies */
  readonly memoryStrategies?: agentcore.IMemoryStrategy[];
}

/** Reusable AgentCore Memory - owns the reosurce and it's grant logic */
export class AgentMemory extends Construct {
  public readonly memory: agentcore.Memory;

  constructor(scope: Construct, id: string, props: AgentMemoryProps = {}) {
    super(scope, id);

    this.memory = new agentcore.Memory(this, "Resource", {
      memoryName: props.memoryName,
      description: props.description,
      memoryStrategies: props.memoryStrategies ?? [
        agentcore.MemoryStrategy.usingBuiltInSummarization(),
        agentcore.MemoryStrategy.usingBuiltInSemantic(),
        agentcore.MemoryStrategy.usingBuiltInUserPreference(),
      ],
    });
  }

  /** Inject this as AgentCore Memory */
  public get memoryId(): string{
    return this.memory.memoryId;
  }

  /** Grant runtime role the read & write permissions on this memory */
  public grantUse(role: iam.IRole): void {
    this.memory.grantRead(role);
    this.memory.grantWrite(role);
  }
}
