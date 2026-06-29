#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentcoreLabStack } from '../lib/agentcore-lab-stack';

const app = new cdk.App();
new AgentcoreLabStack(app, 'AgentcoreLabStack', {
  // Resolve account/region from the CLI/CI environment (set in GitHub Actions).
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
