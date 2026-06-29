import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { AgentMemory, AgentTools, AgentRuntime } from "../constructs";

export class AgentcoreLabStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const memory = new AgentMemory(this, "Memory");
    const tools = new AgentTools(this, "Tools", { enableBrowser: true });

    const runtime = new AgentRuntime(this, "Runtime", {
      agentAssetsPath: path.join(__dirname, "../../agent"),
      memory,
      tools
    });

    new cdk.CfnOutput(this, "RuntimeArn", { value: runtime.runtimeArn });
  }
}
