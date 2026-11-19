export default function StagePlaceholder({ stage }: { stage: string }) {
  return <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-studio-line p-8 text-center"><div className="text-sm font-medium">The {stage} screen arrives in the next feature.</div><div className="mt-1 text-xs text-studio-muted">The shell, project list and settings are live now.</div></div>;
}
