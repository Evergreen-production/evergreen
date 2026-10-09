interface ContractStatus {
  contractId: string;
  label: string;
  overallStatus: 'healthy' | 'warning' | 'critical' | 'archived';
  checkedAt: string;
  entries: Array<{
    remainingLedgers: number;
    remainingSeconds: number;
    liveUntilLedgerSeq: number;
    expiresAt: string;
    status: 'healthy' | 'warning' | 'critical' | 'archived';
  }>;
}

export const dynamic = 'force-dynamic';

interface DashboardData {
  contracts: ContractStatus[];
  keeperStatus: string;
  connected: boolean;
}

async function loadDashboardData(): Promise<DashboardData> {
  const keeperUrl = process.env.KEEPER_URL;
  if (!keeperUrl) {
    return { contracts: [], keeperStatus: 'Not configured', connected: false };
  }

  const headers: HeadersInit = {};
  const token = process.env.EVERGREEN_KEEPER_API_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const [contractsResponse, statusResponse] = await Promise.all([
      fetch(new URL('/contracts', keeperUrl), { headers, cache: 'no-store' }),
      fetch(new URL('/status', keeperUrl), { headers, cache: 'no-store' }),
    ]);
    if (!contractsResponse.ok || !statusResponse.ok) throw new Error('Keeper request failed');
    const contractsBody = (await contractsResponse.json()) as { contracts: ContractStatus[] };
    const statusBody = (await statusResponse.json()) as { overall: string };
    return { contracts: contractsBody.contracts, keeperStatus: statusBody.overall, connected: true };
  } catch {
    return { contracts: [], keeperStatus: 'Unavailable', connected: false };
  }
}

interface ContractRow {
  id: string;
  name: string;
  address: string;
  ttlRemaining: number;
  ttlDays: number;
  expiresAt: string | null;
  liveUntilLedger: number | null;
  status: 'healthy' | 'warning' | 'critical' | 'archived';
  lastExtended: string;
  autoBump: boolean;
}

export default async function DashboardPage() {
  const data = await loadDashboardData();
  const contracts: ContractRow[] = data.contracts.map((contract) => ({
    id: contract.contractId,
    name: contract.label,
    address: `${contract.contractId.slice(0, 4)}...${contract.contractId.slice(-3)}`,
    ttlRemaining: contract.entries.length
      ? Math.min(...contract.entries.map((entry) => entry.remainingLedgers))
      : 0,
    ttlDays: contract.entries.length
      ? Math.max(0, Math.min(...contract.entries.map((entry) => entry.remainingSeconds)) / 86_400)
      : 0,
    expiresAt: contract.entries.length
      ? contract.entries.reduce((soonest, entry) =>
          new Date(entry.expiresAt) < new Date(soonest) ? entry.expiresAt : soonest,
        contract.entries[0].expiresAt)
      : null,
    liveUntilLedger: contract.entries.length
      ? Math.min(...contract.entries.map((entry) => entry.liveUntilLedgerSeq))
      : null,
    status: contract.overallStatus,
    lastExtended: new Date(contract.checkedAt).toLocaleString(),
    autoBump: true,
  }));
  const healthyCount = contracts.filter((contract) => contract.status === 'healthy').length;
  const healthRatio = contracts.length === 0 ? 0 : Math.round((healthyCount / contracts.length) * 100);
  const lowestTtlDays = contracts.length ? Math.min(...contracts.map((contract) => contract.ttlDays)) : 0;
  const statusTone = data.keeperStatus === 'healthy'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : data.keeperStatus === 'warning'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#064e3b33,_transparent_35%),linear-gradient(#020617,#0f172a)] text-slate-100 px-4 py-8 sm:px-8">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col gap-5 border-b border-slate-800/80 pb-7 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-400 flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            Evergreen Keeper
          </h1>
          <p className="text-slate-400 mt-2 max-w-2xl">
            Live Stellar Testnet observability for Soroban contract state lifetime and archival risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm">
            <span className="text-slate-400">Network:</span>{' '}
            <span className="text-emerald-400 font-mono">Testnet (Protocol 21)</span>
          </div>
          <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm">
            <span className="text-slate-400">Keeper Status:</span>{' '}
            <span className={data.keeperStatus === 'healthy' ? "text-emerald-400 font-semibold capitalize" : "text-rose-400 font-semibold capitalize"}>
              {data.keeperStatus}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">
        <section className={`rounded-2xl border p-5 ${statusTone}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Live risk assessment</p>
              <h2 className="mt-1 text-xl font-semibold capitalize">{data.keeperStatus} contract state</h2>
              <p className="mt-1 text-sm opacity-80">
                {data.keeperStatus === 'critical'
                  ? 'The shortest-lived entry is below the configured 7-day extension threshold. Production is read-only, so no transaction is submitted automatically.'
                  : 'The keeper is connected and reporting current Stellar ledger data.'}
              </p>
            </div>
            <a href="https://entity-6.gitbook.io/evergreen-documentation/submission/live-demo" className="shrink-0 rounded-lg border border-current/30 px-4 py-2 text-center text-sm font-semibold hover:bg-white/10">
              Evaluation guide ↗
            </a>
          </div>
        </section>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Monitored Contracts</h3>
            <p className="text-3xl font-bold mt-2 text-slate-100">{contracts.length}</p>
            <span className="text-xs text-emerald-400 mt-1 inline-block">
              {data.connected ? 'Live keeper data' : 'Keeper unavailable'}
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Health Ratio</h3>
            <p className={`text-3xl font-bold mt-2 ${healthRatio === 100 ? 'text-emerald-400' : 'text-rose-400'}`}>{healthRatio}%</p>
            <span className="text-xs text-slate-400 mt-1 inline-block">
              {healthyCount} / {contracts.length} contracts healthy
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Lowest Remaining TTL</h3>
            <p className="text-3xl font-bold mt-2 text-amber-400">{lowestTtlDays.toFixed(1)} days</p>
            <span className="text-xs text-slate-400 mt-1 inline-block">Based on live Testnet ledgers</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Operating Mode</h3>
            <p className="text-3xl font-bold mt-2 text-blue-400">Read-only</p>
            <span className="text-xs text-slate-400 mt-1 inline-block">No signer configured in production</span>
          </div>
        </div>

        {/* Contract Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">TTL Registry Status</h2>
              <p className="mt-1 text-sm text-slate-400">Live instance and code-entry lifetime from Stellar RPC.</p>
            </div>
            <a href="https://stellar.expert/explorer/testnet" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">Open Stellar Explorer ↗</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <th className="py-4 px-6">Contract Name</th>
                  <th className="py-4 px-6">Address</th>
                  <th className="py-4 px-6">Remaining TTL (Ledgers)</th>
                  <th className="py-4 px-6">Time Remaining</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Last Checked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 px-6 text-center text-slate-400">
                      {data.connected ? 'No contracts are configured.' : 'Keeper data is currently unavailable.'}
                    </td>
                  </tr>
                )}
                {contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-6 font-medium text-slate-200">{c.name}</td>
                    <td className="py-4 px-6 font-mono text-slate-400">
                      <a className="hover:text-emerald-400" href={`https://stellar.expert/explorer/testnet/contract/${c.id}`}>{c.address} ↗</a>
                    </td>
                    <td className="py-4 px-6 font-mono font-semibold">
                      {c.ttlRemaining.toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-slate-300">
                      <div>{c.ttlDays.toFixed(2)} days</div>
                      <div className="mt-1 text-xs text-slate-500">Ledger {c.liveUntilLedger?.toLocaleString()}</div>
                    </td>
                    <td className="py-4 px-6">
                      {c.status === 'healthy' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Healthy
                        </span>
                      )}
                      {c.status === 'warning' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950 text-amber-400 border border-amber-800">
                          Warning
                        </span>
                      )}
                      {c.status === 'critical' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950 text-rose-400 border border-rose-800">
                          Critical
                        </span>
                      )}
                      {c.status === 'archived' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          Archived
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-slate-400">{c.lastExtended}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
