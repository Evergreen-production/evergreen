'use client';

import React, { useState } from 'react';

interface ContractStatus {
  id: string;
  name: string;
  address: string;
  ttlRemaining: number;
  minTtl: number;
  status: 'healthy' | 'warning' | 'critical' | 'archived';
  lastExtended: string;
  autoBump: boolean;
}

export default function DashboardPage() {
  const [contracts] = useState<ContractStatus[]>([
    {
      id: '1',
      name: 'Liquidity Pool Vault',
      address: 'CA7...92K',
      ttlRemaining: 142000,
      minTtl: 50000,
      status: 'healthy',
      lastExtended: '2 hours ago',
      autoBump: true,
    },
    {
      id: '2',
      name: 'Governance Voting',
      address: 'CB3...11X',
      ttlRemaining: 48000,
      minTtl: 50000,
      status: 'warning',
      lastExtended: '1 day ago',
      autoBump: true,
    },
    {
      id: '3',
      name: 'Staking Rewards Store',
      address: 'CC9...88M',
      ttlRemaining: 12000,
      minTtl: 50000,
      status: 'critical',
      lastExtended: '3 days ago',
      autoBump: true,
    },
    {
      id: '4',
      name: 'Legacy Escrow State',
      address: 'CD1...44P',
      ttlRemaining: 0,
      minTtl: 50000,
      status: 'archived',
      lastExtended: 'Never (Restore pending)',
      autoBump: false,
    },
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <header className="max-w-7xl mx-auto mb-8 flex justify-between items-center border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-400 flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            Evergreen Keeper
          </h1>
          <p className="text-slate-400 mt-1">
            Soroban Contract State TTL Scanning & Automated Extension Keeper
          </p>
        </div>
        <div className="flex gap-3">
          <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm">
            <span className="text-slate-400">Network:</span>{' '}
            <span className="text-emerald-400 font-mono">Testnet (Protocol 21)</span>
          </div>
          <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm">
            <span className="text-slate-400">Keeper Status:</span>{' '}
            <span className="text-emerald-400 font-semibold">Active</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Monitored Contracts</h3>
            <p className="text-3xl font-bold mt-2 text-slate-100">4</p>
            <span className="text-xs text-emerald-400 mt-1 inline-block">100% active scan</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Health Ratio</h3>
            <p className="text-3xl font-bold mt-2 text-emerald-400">75%</p>
            <span className="text-xs text-slate-400 mt-1 inline-block">3 / 4 contracts compliant</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Bumps (24h)</h3>
            <p className="text-3xl font-bold mt-2 text-blue-400">18</p>
            <span className="text-xs text-slate-400 mt-1 inline-block">Avg cost: 0.005 XLM</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Spending Cap</h3>
            <p className="text-3xl font-bold mt-2 text-amber-400">1.25 / 5.0 XLM</p>
            <span className="text-xs text-slate-400 mt-1 inline-block">Daily budget limit</span>
          </div>
        </div>

        {/* Contract Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-xl font-semibold">TTL Registry Status</h2>
            <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 transition-colors text-white font-medium rounded-lg text-sm">
              + Register Contract
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <th className="py-4 px-6">Contract Name</th>
                  <th className="py-4 px-6">Address</th>
                  <th className="py-4 px-6">Remaining TTL (Ledgers)</th>
                  <th className="py-4 px-6">Threshold</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Last Extension</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                {contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-6 font-medium text-slate-200">{c.name}</td>
                    <td className="py-4 px-6 font-mono text-slate-400">{c.address}</td>
                    <td className="py-4 px-6 font-mono font-semibold">
                      {c.ttlRemaining.toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-slate-400">{c.minTtl.toLocaleString()}</td>
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
