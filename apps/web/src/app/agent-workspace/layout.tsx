import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Workspace | MedicalCor Cortex',
  description: 'Unified workspace for agents to handle calls and leads',
};

export default function AgentWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
