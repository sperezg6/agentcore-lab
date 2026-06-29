import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";

export interface AgentToolsProps {
  readonly codeInterpreterName?: string;
  /** Also Provision a Managed Cloud Browser Tool */
  readonly enableBrowser?: boolean;
  readonly browserName?: string;
}

/** Reusable bundle of AgentCore built-in tools */
export class AgentTools extends Construct {
  public readonly codeInterpreter: agentcore.CodeInterpreterCustom;
  public readonly browser?: agentcore.BrowserCustom;

  constructor(scope: Construct, id: string, props: AgentToolsProps = {}) {
    super(scope, id)

    this.codeInterpreter = new agentcore.CodeInterpreterCustom(this, "CodeInterpreter", {
      codeInterpreterCustomName: props.codeInterpreterName,
      description: "Sandboxed Code Execution",
      networkConfiguration:
        agentcore.CodeInterpreterNetworkConfiguration.usingSandboxNetwork(),
    });

    if (props.enableBrowser) {
      this.browser = new agentcore.BrowserCustom(this, "Browser", {
        browserCustomName: props.browserName,
        description: "Managed Cloud Browser",
        networkConfiguration:
          agentcore.BrowserNetworkConfiguration.usingPublicNetwork(),
      });
    }
  }

  public get codeInterpreterEnabled(): boolean {
    return true;
  }
  /** Grant the runtime role permissions */
  public grantUse(role: iam.IRole): void {
    this.codeInterpreter.grantUse(role);
    this.browser?.grantUse(role);
  }
}
